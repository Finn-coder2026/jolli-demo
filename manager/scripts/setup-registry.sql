-- Run this script as a PostgreSQL superuser (e.g., postgres) to create the registry database
-- psql -U postgres -f scripts/setup-registry.sql

-- Create the registry database
CREATE DATABASE jolli_registry;

-- Connect to the registry database
\c jolli_registry

-- The tables will be created automatically by Sequelize when the app starts
-- This script just ensures the database exists

\echo 'Registry database created successfully!'
\echo 'You can now start the manager with: npm run dev'
