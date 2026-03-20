
import logging
import subprocess
import sys
from datetime import date
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse


# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("api.log", mode="a"),
    ],
)
logger = logging.getLogger(__name__)


# Rutas de datos
FACT_PATH = Path("data/model/fact_outages.parquet")
AGG_PATH  = Path("data/model/agg_monthly.parquet")

# App FastAPI
app = FastAPI(
    title="EIA Nuclear Outages API",
    description="Acceso a datos de outages nucleares en EE.UU. extraídos de la API de EIA.",
    version="1.0.0",
)

# CORS 
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8080",
        "https://A01749099.github.io"
    ],
    allow_credentials=True,   
    allow_methods=["*"],
    allow_headers=["*"],
)


# Cargar datos desde el Parquet generado por el conector y model
def load_fact() -> pd.DataFrame:
    if not FACT_PATH.exists():
        raise HTTPException(
            status_code=503,
            detail=(
                "Los datos aún no están disponibles. "
                "Llama a POST /refresh para extraerlos primero."
            ),
        )
    df = pd.read_parquet(FACT_PATH)
    # Aseguramos que date_id sea string para comparaciones
    df["date_id"] = df["date_id"].astype(str)
    return df


# Endpoint para obtener datos filtrados de outages nucleares. GET
@app.get(
    "/data",
    summary="Obtener datos de outages",
    response_description="Lista de registros diarios de outages nucleares",
)
def get_data(
    start_date: Optional[date] = Query(
        default=None,
        description="Fecha de inicio (YYYY-MM-DD). Ej: 2023-01-01",
        examples="2023-01-01",
    ),
    end_date: Optional[date] = Query(
        default=None,
        description="Fecha de fin (YYYY-MM-DD). Ej: 2023-12-31",
        examples="2023-12-31",
    ),
    min_percent_outage: Optional[float] = Query(
        default=None,
        ge=0,
        le=100,
        description="Filtrar registros con % de outage >= este valor. Ej: 10.0",
        examples=10.0,
    ),
    max_percent_outage: Optional[float] = Query(
        default=None,
        ge=0,
        le=100,
        description="Filtrar registros con % de outage <= este valor. Ej: 20.0",
        examples=20.0,
    ),
    page: int = Query(default=1, ge=1, description="Número de página (empieza en 1)"),
    limit: int = Query(default=100, ge=1, le=1000, description="Registros por página (max 1000)"),
    sort_by: str = Query(default="date_id", description="Campo por el que ordenar"),
    order: str = Query(default="desc", pattern="^(asc|desc)$", description="asc o desc"),
):
    #Retorna registros diarios de outages nucleares con filtros opcionales.

    logger.info(
        f"GET /data | start={start_date} end={end_date} "
        f"min_pct={min_percent_outage} max_pct={max_percent_outage} "
        f"page={page} limit={limit}"
    )

    df = load_fact()

    #  Filtros 
    if start_date:
        df = df[df["date_id"] >= str(start_date)]
    if end_date:
        df = df[df["date_id"] <= str(end_date)]
    if min_percent_outage is not None:
        df = df[df["percent_outage"] >= min_percent_outage]
    if max_percent_outage is not None:
        df = df[df["percent_outage"] <= max_percent_outage]

    #Validar campo de ordenamiento 
    valid_sort_fields = ["date_id", "capacity_mw", "outage_mw", "available_mw", "percent_outage"]
    if sort_by not in valid_sort_fields:
        raise HTTPException(
            status_code=400,
            detail=f"sort_by inválido. Opciones: {valid_sort_fields}",
        )

    # Ordenamiento 
    df = df.sort_values(sort_by, ascending=(order == "asc"))

    #Totales antes de paginar 
    total_records = len(df)
    total_pages   = max(1, (total_records + limit - 1) // limit)

    # Paginación 
    offset = (page - 1) * limit
    df_page = df.iloc[offset : offset + limit]

    if df_page.empty and total_records > 0:
        raise HTTPException(
            status_code=404,
            detail=f"Página {page} no existe. Total de páginas: {total_pages}",
        )

    df_page = df_page.copy()

    for col in df_page.columns:
        if pd.api.types.is_datetime64_any_dtype(df_page[col]):
            df_page[col] = df_page[col].astype(str)
    # Serialización (NaN → None para JSON válido)
    records = df_page.where(pd.notna(df_page), other=None).to_dict(orient="records")

    return JSONResponse(content={
        "meta": {
            "total_records": total_records,
            "total_pages":   total_pages,
            "page":          page,
            "limit":         limit,
            "filters": {
                "start_date":          str(start_date)         if start_date         else None,
                "end_date":            str(end_date)           if end_date           else None,
                "min_percent_outage":  min_percent_outage,
                "max_percent_outage":  max_percent_outage,
            },
        },
        "data": records,
    })


# Endpoint para disparar extracción de datos desde la API de EIA. POST
@app.post(
    "/refresh",
    summary="Disparar extracción de datos",
    response_description="Estado del proceso de extracción",
)
# Ejecuta el pipeline completo de extracción y modelado. Retorna un resumen del proceso
def refresh():

    logger.info("POST /refresh — iniciando pipeline de extracción")

    connector_path  = Path("data_connector.py")
    data_model_path = Path("data_model.py")

    # Verificar que los scripts existen
    for script in [connector_path, data_model_path]:
        if not script.exists():
            raise HTTPException(
                status_code=500,
                detail=f"Script no encontrado: {script}. Verifica la estructura del proyecto.",
            )

    results = {}

    #  Paso 1:Ejecutar connector.py -
    try:
        logger.info("Ejecutando connector.py...")
        result = subprocess.run(
            [sys.executable, str(connector_path)],
            capture_output=True,
            text=True,
            timeout=120,   
        )
        if result.returncode != 0:
            logger.error(f"connector.py falló:\n{result.stderr}")
            raise HTTPException(
                status_code=500,
                detail={
                    "step":    "connector",
                    "error":   "El conector falló al extraer datos.",
                    "details": result.stderr[-500:],  # últimas 500 chars del error
                },
            )
        results["connector"] = "ok"
        logger.info("connector.py completado exitosamente.")

    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=504,
            detail="El conector excedió el tiempo límite (120s). Intenta de nuevo.",
        )

    # Paso 2: Ejecutar data_model.py
    try:
        logger.info("Ejecutando data_model.py...")
        result = subprocess.run(
            [sys.executable, str(data_model_path)],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode != 0:
            logger.error(f"data_model.py falló:\n{result.stderr}")
            raise HTTPException(
                status_code=500,
                detail={
                    "step":    "data_model",
                    "error":   "El modelo de datos falló.",
                    "details": result.stderr[-500:],
                },
            )
        results["data_model"] = "ok"
        logger.info("data_model.py completado exitosamente.")

    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=504,
            detail="El modelo de datos excedió el tiempo límite (60s). Intenta de nuevo.",
        )

    #  Leer totales actualizados para generar un resumen
    try:
        df = pd.read_parquet(FACT_PATH)
        total_records = len(df)
        date_range = f"{df['date_id'].min()} a {df['date_id'].max()}"
    except Exception:
        total_records = "desconocido"
        date_range    = "desconocido"

    logger.info(f"Refresh completado. {total_records} registros disponibles.")

    return JSONResponse(content={
        "status":  "ok",
        "message": "Pipeline ejecutado exitosamente.",
        "steps":   results,
        "data": {
            "total_records": total_records,
            "date_range":    date_range,
        },
    })


# Endpoint raíz para verificar que la API está corriendo y mostrar estado básico
@app.get("/", include_in_schema=False)
def root():
    """Health check básico."""
    data_ready = FACT_PATH.exists()
    return {
        "service":    "EIA Nuclear Outages API",
        "version":    "1.0.0",
        "status":     "ok",
        "data_ready": data_ready,
        "docs":       "/docs",
    }