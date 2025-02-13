FROM mariadb:latest

# Environment variables for MariaDB
ENV MYSQL_ROOT_PASSWORD=rootpassword

# Copy only the essential setup files
COPY users.sql /docker-entrypoint-initdb.d/1-users.sql
COPY "schema&seed.sql" /docker-entrypoint-initdb.d/2-schema.sql

# Set permissions
RUN chmod 644 /docker-entrypoint-initdb.d/*.sql

# Expose MySQL port
EXPOSE 3306