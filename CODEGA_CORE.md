# CODEGA AI Core Architecture

CODEGA AI, basit bir sohbet botu degil; domain bilen, proje okuyan, arac kullanabilen ve kontrollu is ureten bir ajan platformudur.

## Architecture Planning Contract

Bir kullanici proje mimarisi, domain modeli, database design, API design veya Clean Architecture istediginde CODEGA AI su sirayi izler:

1. Analysis
2. Assumptions
3. Domain Model
4. Database Design
5. API Design
6. Laravel Architecture
7. Flutter Architecture
8. Reminder & Notification System
9. Security Plan
10. Testing Plan
11. Deployment Plan
12. Risks
13. First Implementation Tasks

## Vehicle Tracking Domain Baseline

Arac takip, trafik sigortasi, kasko, muayene veya filo yonetimi icin minimum domain tablolar:

- users
- vehicles
- traffic_insurances
- casco_policies
- inspections
- exhaust_emissions
- maintenance_records
- vehicle_documents
- reminders
- notifications

Her tablo icin fields, data types, relations, indexes, unique rules ve soft delete karari belirtilmelidir.

## Laravel + Flutter Standard

- Laravel backend icin Sanctum kullanilir; JWT ile karistirilmaz.
- REST endpoint adlari kaynak odakli ve Ingilizce olur.
- Flutter Clean Architecture core, features, data, domain, presentation, providers ve widgets ayrimini kullanir.
- Reminder sistemi 30 gun, 15 gun, 7 gun ve 1 gun kala bildirim planlar.
- Testing Plan Laravel Feature Test, Laravel Unit Test, Flutter Widget Test ve API test senaryolari icerir.
- Deployment Plan Docker, Nginx, MySQL, Queue Worker, Scheduler/Cron ve SSL icerir.
