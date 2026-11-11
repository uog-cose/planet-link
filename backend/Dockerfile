FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
RUN groupadd --system youthquest && useradd --system --gid youthquest --create-home youthquest
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
RUN chmod +x entrypoint.sh && mkdir -p /app/data /app/staticfiles /app/media && chown -R youthquest:youthquest /app
EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["gunicorn","config.asgi:application","--bind","0.0.0.0:8000","--workers","2","--worker-class","uvicorn.workers.UvicornWorker","--access-logfile","-","--timeout","60"]
