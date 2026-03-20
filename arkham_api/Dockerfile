FROM python:3.12-slim

# Evita que Python escriba archivos .pyc y habilita logs en tiempo real
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiar dependencias primero (aprovecha cache de Docker)
COPY requirements.txt .

# Instalar dependencias
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código de la aplicación
COPY api.py .
COPY data_connector.py .
COPY data_model.py .

# Cloud Run puerto
ENV PORT=8080

# Exponer el puerto
EXPOSE 8080

# Comando para arrancar la API con uvicorn

CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT} --workers 1"]