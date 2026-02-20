FROM python:3.11-slim

WORKDIR /app

# Install dependencies first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py .

# Expose the port (Railway uses $PORT, fallback to 3003)
EXPOSE 3003

# Run with uvicorn — use PORT env var if set by Railway
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-3003}
