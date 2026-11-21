FROM python:3.10-slim

ARG LUNCH_MONEY_API_KEY
ENV LUNCH_MONEY_API_KEY=$LUNCH_MONEY_API_KEY

# Install git (required since "expense-tracker" dependency only on git)
RUN apt-get update && apt-get install -y git

# Set workding directory in container
WORKDIR /app/client

# Copy requirements.txt to container
COPY requirements.txt .

# Download dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install Waitress production server
RUN pip install waitress

# Copy application code into the container
COPY . .

# Expose the port the app runs on
EXPOSE 8050

# Define environment variable for Flask
ENV FLASK_ENV=production

# Run the Dash app
CMD ["python", "app_dash.py"]
## CMD ["make", "run_dash"]

# Expose the port the app runs on
## EXPOSE 8080

# Run the Dash app using Waitress
## CMD ["waitress-serve", "--host", "0.0.0.0", "--port", "8080", "app:server"]
