# Skill: Architecture Planning

Use this skill when the user asks for software architecture, database design, API design, Laravel, Flutter Clean Architecture, or says "henuz kod yazma".

Required output sections:

# Analysis
# Assumptions
# Domain Model
# Database Design
# API Design
# Laravel Architecture
# Flutter Architecture
# Reminder & Notification System
# Security Plan
# Testing Plan
# Deployment Plan
# Risks
# First Implementation Tasks

Rules:

- Analyze whether an existing project is present before proposing implementation.
- Keep assumptions explicit in the Assumptions section.
- Do domain analysis before code. If the user says not to write code yet, do not generate code, files, ZIPs, migrations, or implementation snippets.
- Use Turkish explanations, but English technical identifiers. Do not use Turkish characters in code, table, migration, class, endpoint, file, or field names.
- For Laravel + Flutter systems, Laravel Sanctum is the required Laravel auth choice. Do not leave it vague as "Sanctum or JWT", and do not call Sanctum JWT.
- For vehicle tracking systems include users, vehicles, traffic_insurances, casco_policies, inspections, exhaust_emissions, maintenance_records, vehicle_documents, reminders, notifications.
- For every database table include fields, data types, relations, indexes, unique rules, and whether soft delete is required.
- REST API sections must use resource-oriented endpoints.
- Flutter Clean Architecture must include core, features, data, domain, presentation, providers, and widgets.
- Reminder planning must include 30 days, 15 days, 7 days, and 1 day before due date.
- Testing Plan must include Laravel Feature Test, Laravel Unit Test, Flutter Widget Test, and API test scenarios.
- Security Plan must include Auth, rate limit, vehicle ownership checks, file upload security, and logging.
- Deployment Plan must include Docker, Nginx, MySQL, Queue Worker, Scheduler/Cron, and SSL.
