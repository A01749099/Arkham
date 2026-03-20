import logging, io
import pandas as pd

import sys
import os
from dotenv import load_dotenv
from google.cloud import storage
load_dotenv()
sys.stdout.reconfigure(encoding='utf-8')


# Archivo de logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("data_model.log", mode="a"),
    ],
)
logger = logging.getLogger(__name__)


# Rutas
#INPUT_FILE  = Path("data/nuclear_outages.parquet")   # salida del conector
#OUTPUT_DIR  = Path("data/model")
GCS_BUCKET = os.environ.get("GCS_BUCKET")
GCS_PREFIX = os.environ.get("GCS_PREFIX")


# Lectura del parquet generado por el conector
def load_raw() -> pd.DataFrame:
    #Lee el Parquet de storage
    try:
        client = storage.Client()
        bucket = client.bucket(GCS_BUCKET)
        blob   = bucket.blob(f"{GCS_PREFIX}/nuclear_outages.parquet")

        if not blob.exists():
            raise FileNotFoundError(
                f"No se encontró el archivo en storage: "
                f"gs://{GCS_BUCKET}/{GCS_PREFIX}/nuclear_outages.parquet\n"
                "Ejecuta primero data_connector.py para generarlo."
            )

        data = blob.download_as_bytes()
        df   = pd.read_parquet(io.BytesIO(data))
        logger.info(f"Datos cargados desde google cloud storage: {len(df):,} filas")
        return df

    except Exception as e:
        logger.error(f"Error al leer desde google: {e}")
        raise




# Tabla 1: Dimensión de tiempo para representar un dia unico presente en los datos.
def build_dim_date(df: pd.DataFrame) -> pd.DataFrame:
    dates = df["period"].drop_duplicates().sort_values()

    dim = pd.DataFrame()
    dim["date_id"]    = dates.dt.strftime("%Y-%m-%d")   # PK — clave de unión
    dim["year"]       = dates.dt.year
    dim["month"]      = dates.dt.month
    dim["day"]        = dates.dt.day
    dim["quarter"]    = dates.dt.quarter
    dim["month_name"] = dates.dt.strftime("%B")          # January, February…
    dim["year_month"] = dates.dt.strftime("%Y-%m")       # FK hacia agg_monthly

    dim = dim.reset_index(drop=True)
    logger.info(f"dim_date: {len(dim):,} filas | rango {dim['date_id'].min()} -> {dim['date_id'].max()}")
    return dim



# Tabla 2: medicion_dia mediciones de cada dia. 

def build_medicion_dia(df: pd.DataFrame) -> pd.DataFrame:

    datos = pd.DataFrame()
    datos["date_id"]        = df["period"].dt.strftime("%Y-%m-%d")   
    datos["capacity_mw"]    = df["capacity"].astype(float)
    datos["outage_mw"]      = df["outage"].astype(float)

    # Capacidad disponible = capacidad total − outage
    datos["available_mw"]   = datos["capacity_mw"] - datos["outage_mw"]
    datos["percent_outage"]  = df["percentOutage"].astype(float)
    datos["extracted_at"]   = df["extracted_at"]

    fact = datos.sort_values("date_id").reset_index(drop=True)
    logger.info(f"medicion_dia: {len(fact):,} filas")
    return fact



# Tabla 3: resumen_mensual Un resumen mensual pre-calculado para un análisis rápido.
def build_resumen_mensual(fact: pd.DataFrame) -> pd.DataFrame:
    tmp = fact.copy()
    tmp["year_month"] = tmp["date_id"].str[:7]   

    agg = (
        tmp.groupby("year_month")
        .agg(
            avg_outage_mw    = ("outage_mw",      "mean"),
            max_outage_mw    = ("outage_mw",      "max"),
            min_outage_mw    = ("outage_mw",      "min"),
            avg_percent_outage = ("percent_outage","mean"),
            total_days       = ("date_id",        "count"),
        )
        .round(3)
        .reset_index()
        .sort_values("year_month")
    )
    logger.info(f"resumen_mensual: {len(agg):,} meses")
    return agg


# Funcion para guardado de tablas individuales como Parquet
def save_table(df: pd.DataFrame, name: str) -> None:
    buffer = io.BytesIO()
    df.to_parquet(buffer, index=False, engine="pyarrow")
    buffer.seek(0)

    client = storage.Client()
    bucket = client.bucket(GCS_BUCKET)
    blob   = bucket.blob(f"{GCS_PREFIX}/model/{name}.parquet")
    blob.upload_from_file(buffer, content_type="application/octet-stream")

    logger.info(f"Subido a google cloud storage: gs://{GCS_BUCKET}/{GCS_PREFIX}/model/{name}.parquet")


def main():
    logger.info("Data Model")
    
    # Cargar datos desde el Parquet generado por el conector
    raw = load_raw()

    # Construir las 3 tablas
    dim_date    = build_dim_date(raw)
    medicion_dia = build_medicion_dia(raw)
    resumen_mensual  = build_resumen_mensual(medicion_dia)

    # Guardar cada tabla en su propio Parquet
    save_table(dim_date,     "dim_date")
    save_table(medicion_dia, "medicion_dia")
    save_table(resumen_mensual,  "resumen_mensual")

    # Resumen 
    logger.info("Resumen del modelo:")
    logger.info(f"  dim_date     -> {len(dim_date):,} dias")
    logger.info(f"  medicion_dia -> {len(medicion_dia):,} registros")
    logger.info(f"  resumen_mensual  -> {len(resumen_mensual):,} meses")
    logger.info("Archivos en: data/model/")

    # Vista previa de datos
    print("\n--- dim_date (primeras 3 filas) ---")
    print(dim_date.head(3).to_string(index=False))
    print("\n--- medicion_dia (primeras 3 filas) ---")
    print(medicion_dia.head(3).to_string(index=False))
    print("\n--- resumen_mensual (primeras 3 filas) ---")
    print(resumen_mensual.head(3).to_string(index=False))

if __name__ == "__main__":
    main()