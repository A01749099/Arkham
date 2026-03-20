import os, io
import time
import logging
import requests
import pandas as pd

from datetime import datetime, timezone
from google.cloud import storage
from dotenv import load_dotenv
load_dotenv()  

# Configuración para archivo de logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),                          
        logging.FileHandler("data_connector.log", mode="a"),  
    ],
)
logger = logging.getLogger(__name__)

# Constantes
BASE_URL = os.environ.get("API_BASE_URL", "")
# Campos de datos que se solicitan a la API
DATA_FIELDS = [
    "capacity",
    "outage",
    "percentOutage",
]
# Registros validos deben tener estos campos
REQUIRED_FIELDS = ["period", "capacity", "outage", "percentOutage","capacity-units","outage-units","percentOutage-units"]
PAGE_SIZE = 5000   # máximo permitido por la API
MAX_RETRIES = 2    # número de reintentos ante falla de red
RETRY_DELAY = 3    # segundos entre reintentos

#OUTPUT_DIR = Path("data")
#OUTPUT_FILE = OUTPUT_DIR / "nuclear_outages.parquet"
GCS_BUCKET = os.environ.get("GCS_BUCKET")
GCS_PREFIX = os.environ.get("GCS_PREFIX")


# Autenticación
# ---------------------------------------------------------------------------
def get_api_key() -> str:
    api_key = os.environ.get("EIA_API_KEY", "").strip()

    if not api_key:
        # Error claro: no puede continuar sin credenciales
        logger.error(
            "API key no encontrada. "
            "Coloca el valor de la variable de entorno EIA_API_KEY en el archivo .env"
        )
        raise EnvironmentError("EIA_API_KEY no definida.")
    logger.info("API key cargada correctamente.")
    return api_key


#Peticion GET a API con reintentos 
def fetch_page(api_key: str, offset: int) -> dict:
    
    # Parametros de la URL
    params = {
        "api_key": api_key,
        "frequency": "daily",
        "data[0]": "capacity",
        "data[1]": "outage",
        "data[2]": "percentOutage",
        "sort[0][column]": "period",
        "sort[0][direction]": "desc",
        "offset": offset,
        "length": PAGE_SIZE,
    }

    for attempt in range(1, MAX_RETRIES + 2):  # 3 intentos totales
        try:
            logger.debug(f"GET {BASE_URL} | offset={offset} | intento={attempt}")
            response = requests.get(BASE_URL, params=params, timeout=30)

            # Errores HTTP obtenidos de la propia API
            if not response.ok:
                try:
                    error_body = response.json()
                    api_message = error_body.get("error", "Sin mensaje de error.")
                    api_code    = error_body.get("code", response.status_code)
                except Exception:
                    api_message = response.text or "Sin mensaje de error."
                    api_code    = response.status_code

                logger.error(f"Error de la API (HTTP {api_code}): {api_message}")
                raise requests.HTTPError(
                    f"HTTP {api_code}: {api_message}", response=response
                )

            return response.json()


        except requests.exceptions.ConnectionError as e:
            # Falla de red reintentar
            logger.warning(f"Error de conexión (intento {attempt}): {e}")
        except requests.exceptions.Timeout as e:
            logger.warning(f"Timeout en la petición (intento {attempt}): {e}")
        except requests.HTTPError:
            raise

        # Si no fue el último intento, esperar antes de reintentar
        if attempt <= MAX_RETRIES:
            logger.info(f"Reintentando en {RETRY_DELAY} segundos...")
            time.sleep(RETRY_DELAY)
        else:
            raise RuntimeError(
                f"No se pudo conectar a la API después de {MAX_RETRIES + 1} intentos."
            )



# Funcion para extraer todos los datos de la API
def extract_all_data(api_key: str) -> list[dict]:

    all_records = []
    offset = 0
    total = None  

    while True:
        logger.info(f"Extrayendo página | offset={offset} | page_size={PAGE_SIZE}")

        response_json = fetch_page(api_key, offset)

        # La API devuelve los datos dentro de response["response"]["data"]
        response_data = response_json.get("response", {})
        records = response_data.get("data", [])

        if total is None:
            # El total de registros disponibles 
            total = int(response_data.get("total", 0))
            logger.info(f"Total de registros disponibles en la API: {total:,}")

        if not records:
            logger.info("No se recibieron registros en esta página. Fin de la extracción.")
            break

        all_records.extend(records)
        logger.info(f"Registros acumulados: {len(all_records):,} / {total:,}")

        # Si ya obtuvimos todos los registros, parar extraccion
        if len(all_records) >= total:
            break

        offset += PAGE_SIZE

    logger.info(f"Extracción completa. Total registros obtenidos: {len(all_records):,}")
    return all_records



# Funcion para validar los datos
def validate_data(df: pd.DataFrame) -> pd.DataFrame:

    logger.info("Validando datos...")

    # Verificar que existan las columnas requeridas
    missing_cols = [col for col in REQUIRED_FIELDS if col not in df.columns]
    if missing_cols:
        logger.error(f"Columnas requeridas ausentes en la respuesta: {missing_cols}")
        raise ValueError(f"El dataset no contiene las columnas esperadas: {missing_cols}")

    initial_count = len(df)

    # Eliminar filas que tengan nulos 
    df_valid = df.dropna(subset=REQUIRED_FIELDS)
    dropped = initial_count - len(df_valid)

    if dropped > 0:
        logger.warning(
            f"{dropped} registros descartados por tener campos nulos "
            f"({dropped / initial_count:.1%} del total)."
        )
    else:
        logger.info("Todos los registros fueron validados.")

    return df_valid



# Funcion para convertir los registros a un DataFrame
def transform_data(records: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(records)
    print(df.columns.tolist())
    print(df.head(2))

    # Convertir la columna de fecha al tipo datetime
    if "period" in df.columns:
        df["period"] = pd.to_datetime(df["period"], errors="coerce")

    for col in ["capacity", "outage", "percentOutage"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Agregar fecha de extracción para trazabilidad
    df["extracted_at"] = datetime.now(timezone.utc).replace(tzinfo=None)


    logger.info(f"DataFrame creado: {len(df):,} filas × {len(df.columns)} columnas")
    return df



# Funcion para guardar el DataFrame en Parquet
def save_to_parquet(df: pd.DataFrame) -> None:
     
    client = storage.Client()
    bucket = client.bucket(GCS_BUCKET)
    blob   = bucket.blob(f"{GCS_PREFIX}/nuclear_outages.parquet")

    # Si ya existe un archivo previo, combinar con los datos nuevos
    if blob.exists():
        try:
            existing_data = blob.download_as_bytes()
            df_existing   = pd.read_parquet(io.BytesIO(existing_data))
            
            # Combinar y eliminar duplicados por periodo
            df_combined = pd.concat([df_existing, df], ignore_index=True)
            df_combined = df_combined.drop_duplicates(subset=["period"], keep="last")
            df_combined = df_combined.sort_values("period", ascending=False).reset_index(drop=True)
            
            logger.info(f"Combinando: {len(df_existing):,} existentes + {len(df):,} nuevos = {len(df_combined):,} total")
            df = df_combined
        except Exception as e:
            logger.warning(f"No se pudo combinar con datos existentes: {e} — sobreescribiendo.")

    # Subir a storage
    buffer = io.BytesIO()
    df.to_parquet(buffer, index=False, engine="pyarrow")
    buffer.seek(0)
    blob.upload_from_file(buffer, content_type="application/octet-stream")
    logger.info(f"Subido a google: gs://{GCS_BUCKET}/{GCS_PREFIX}/nuclear_outages.parquet ({len(df):,} registros)")



# Funcion Main
def main():

    logger.info("EIA Nuclear Outages Connector - Inicio")
    
    try:
        # Obtener y validar la API key
        api_key = get_api_key()

        # Extraer todos los datos paginando la API
        raw_records = extract_all_data(api_key)

        if not raw_records:
            logger.warning("No se extrajeron registros. Revisa los parámetros o la API key.")
            return

        # Transformar a DataFrame 
        df = transform_data(raw_records)
        # Validar campos requeridos
        df = validate_data(df)
        # Guardar en archivo parquet
        save_to_parquet(df)

        logger.info("Conector finalizado exitosamente.")
        
    except EnvironmentError:
        raise SystemExit(1)

    except requests.HTTPError as e:
        logger.error(f"Error HTTP al comunicarse con la API: {e}")
        raise SystemExit(1)

    except RuntimeError as e:
        logger.error(f"Error de red: {e}")
        raise SystemExit(1)

    except Exception as e:
        logger.exception(f"Error inesperado: {e}")
        raise SystemExit(1)

if __name__ == "__main__":
    main()
    