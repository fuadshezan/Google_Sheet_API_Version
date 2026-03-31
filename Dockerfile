FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies first to maximize Docker layer cache reuse.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source.
COPY . .

EXPOSE 8000

# Serve FastAPI in container-friendly mode.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]