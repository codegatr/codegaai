"use strict";

/**
 * builder-engine.js — CODEGA AI Builder Engine v1
 *
 * Desteklenen stack'ler:
 *   laravel  — PHP / Laravel 11 (REST API + Auth + Docker)
 *   express  — Node.js / Express (REST API + JWT + Docker)
 *   react    — React 18 + Vite (SPA + Router + Tailwind)
 *   vue      — Vue 3 + Vite (SPA + Vue Router + Pinia)
 *   nextjs   — Next.js 14 App Router (Full-stack)
 *   flutter  — Flutter 3 (Mobile + Riverpod)
 *
 * Her üretilen proje içerir:
 *   ✓ Gerçek çalışan dosyalar (placeholder değil)
 *   ✓ Auth yapısı
 *   ✓ Docker / docker-compose
 *   ✓ .env.example
 *   ✓ .gitignore
 *   ✓ Database şeması / migration
 *   ✓ README.md
 *   ✓ CI/CD (GitHub Actions) — features'da "ci" varsa
 *   ✓ Temel test yapısı — features'da "tests" varsa
 */

const path   = require("node:path");
const fsp    = require("node:fs/promises");
const os     = require("node:os");
const crypto = require("node:crypto");
const fs     = require("node:fs");
const { entityFiles, apiRouteLines } = require("./entity-php");

// ─────────────────────────────────────────────────────────────
// Yardımcı fonksiyonlar
// ─────────────────────────────────────────────────────────────

function slug(name) {
  return (name || "project")
    .toLowerCase()
    .replace(/[çÇ]/g,"c").replace(/[ğĞ]/g,"g").replace(/[ıİ]/g,"i")
    .replace(/[öÖ]/g,"o").replace(/[şŞ]/g,"s").replace(/[üÜ]/g,"u")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,50) || "project";
}

function studly(name) {
  return slug(name).split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

function camel(name) {
  const s = studly(name);
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Dosyaları geçici dizine yaz, sonra ZIP oluştur */
async function packToZip(files, outPath) {
  const tmpDir = path.join(os.tmpdir(), `codega_build_${crypto.randomBytes(4).toString("hex")}`);
  await fsp.mkdir(tmpDir, { recursive: true });

  try {
    // Dosyaları geçici dizine yaz
    for (const f of files) {
      const dest = path.join(tmpDir, f.path);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.writeFile(dest, f.content, "utf8");
    }

    // ZIP oluştur
    await new Promise((resolve, reject) => {
      const archiver = require("archiver");  // lazy require
      const output = fs.createWriteStream(outPath);
      const archive = archiver("zip", { zlib: { level: 6 } });
      output.on("close", resolve);
      archive.on("error", reject);
      archive.pipe(output);
      archive.directory(tmpDir, false);
      archive.finalize();
    });
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────
// Stack tanımları
// ─────────────────────────────────────────────────────────────

const STACKS = {
  laravel: {
    label: "Laravel (PHP)",
    description: "PHP 8.3 / Laravel 11 — REST API, Auth, Migration, Docker",
    language: "PHP",
    defaultDb: "mysql",
    databases: ["mysql", "postgresql", "sqlite"],
    features: ["auth", "docker", "ci", "tests", "api"],
  },
  express: {
    label: "Node.js / Express",
    description: "Node.js 20 / Express 4 — REST API, JWT Auth, Prisma ORM, Docker",
    language: "JavaScript",
    defaultDb: "postgresql",
    databases: ["postgresql", "mysql", "sqlite"],
    features: ["auth", "docker", "ci", "tests", "api"],
  },
  react: {
    label: "React + Vite",
    description: "React 18 / Vite 5 / Tailwind CSS / React Router / Axios",
    language: "JavaScript",
    defaultDb: null,
    databases: [],
    features: ["auth", "docker", "ci", "tests"],
  },
  vue: {
    label: "Vue 3 + Vite",
    description: "Vue 3 / Vite 5 / Pinia / Vue Router / Tailwind CSS",
    language: "JavaScript",
    defaultDb: null,
    databases: [],
    features: ["auth", "docker", "ci", "tests"],
  },
  nextjs: {
    label: "Next.js 14",
    description: "Next.js 14 App Router / TypeScript / Prisma / NextAuth",
    language: "TypeScript",
    defaultDb: "postgresql",
    databases: ["postgresql", "mysql", "sqlite"],
    features: ["auth", "docker", "ci", "tests", "api"],
  },
  flutter: {
    label: "Flutter",
    description: "Flutter 3 / Dart / Riverpod / GoRouter / Dio",
    language: "Dart",
    defaultDb: null,
    databases: [],
    features: ["auth", "ci", "tests"],
  },
};

// ─────────────────────────────────────────────────────────────
// GENERATOR: Laravel
// ─────────────────────────────────────────────────────────────

function generateLaravel({ name, features, database, description, entities = [] }) {
  const s = slug(name);
  const S = studly(name);
  const db = database || "mysql";
  const hasAuth   = features.includes("auth");
  const hasDocker = features.includes("docker");
  const hasCi     = features.includes("ci");
  const hasTests  = features.includes("tests");
  // Domain entity'leri (builder-spec ile normalize edilmiş) → gerçek CRUD.
  const domainEntities = Array.isArray(entities) ? entities.filter((e) => e && e.model && e.table) : [];
  const entityRoutes = domainEntities.length ? apiRouteLines(domainEntities) : "";

  const files = [];

  files.push({ path: "composer.json", content: JSON.stringify({
    name: `codega/${s}`,
    description: description || `${name} — CODEGA AI tarafından üretildi`,
    type: "project",
    license: "MIT",
    require: {
      "php": "^8.3",
      "laravel/framework": "^11.0",
      "laravel/sanctum": "^4.0",
    },
    "require-dev": {
      "phpunit/phpunit": "^11.0",
      "laravel/pint": "^1.0",
    },
    autoload: { "psr-4": { "App\\": "app/", "Database\\Factories\\": "database/factories/", "Database\\Seeders\\": "database/seeders/" } },
    scripts: { post_autoload_dump: ["Illuminate\\Foundation\\ComposerScripts::postAutoloadDump", "@php artisan package:discover --ansi"] },
    config: { "optimize-autoloader": true, "preferred-install": "dist" },
  }, null, 4) });

  files.push({ path: ".env.example", content:
`APP_NAME="${name}"
APP_ENV=local
APP_KEY=
APP_DEBUG=true
APP_URL=http://localhost

LOG_CHANNEL=stack
LOG_LEVEL=debug

DB_CONNECTION=${db}
DB_HOST=127.0.0.1
DB_PORT=${db === "postgresql" ? "5432" : "3306"}
DB_DATABASE=${s.replace(/-/g,"_")}
DB_USERNAME=root
DB_PASSWORD=

CACHE_STORE=database
SESSION_DRIVER=database
QUEUE_CONNECTION=database

MAIL_MAILER=log
` });

  files.push({ path: ".gitignore", content:
`/node_modules
/public/build
/storage/*.key
/vendor
.env
.env.backup
.phpunit.cache
Homestead.json
Homestead.yaml
auth.json
npm-debug.log
yarn-error.log
/.fleet
/.idea
/.vscode
` });

  files.push({ path: "artisan", content:
`#!/usr/bin/env php
<?php

define('LARAVEL_START', microtime(true));

require __DIR__.'/vendor/autoload.php';

$app = require_once __DIR__.'/bootstrap/app.php';

$kernel = $app->make(Illuminate\\Contracts\\Console\\Kernel::class);
$status = $kernel->handle($input = new Symfony\\Component\\Console\\Input\\ArgvInput, new Symfony\\Component\\Console\\Output\\ConsoleOutput);
$kernel->terminate($input, $status);
exit($status);
` });

  files.push({ path: "bootstrap/app.php", content:
`<?php

use Illuminate\\Foundation\\Application;
use Illuminate\\Foundation\\Configuration\\Exceptions;
use Illuminate\\Foundation\\Configuration\\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        //
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();
` });

  files.push({ path: "routes/api.php", content:
`<?php

use Illuminate\\Http\\Request;
use Illuminate\\Support\\Facades\\Route;
${hasAuth ? `use App\\Http\\Controllers\\Auth\\AuthController;\n` : ""}
Route::get('/status', fn() => response()->json(['status' => 'ok', 'app' => config('app.name')]));

${hasAuth ? `Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login',    [AuthController::class, 'login']);
    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/me',      [AuthController::class, 'me']);
    });
});` : ""}

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', fn(Request $request) => $request->user());
});

// ── Domain kaynakları (CODEGA AI entity-güdümlü CRUD) ──
${entityRoutes}
` });

  // Her domain entity için gerçek migration + model + controller.
  domainEntities.forEach((e, i) => {
    for (const f of entityFiles(e, i)) files.push(f);
  });

  files.push({ path: "routes/web.php", content:
`<?php

use Illuminate\\Support\\Facades\\Route;

Route::get('/', fn() => response()->json(['app' => config('app.name'), 'version' => '1.0.0']));
` });

  if (hasAuth) {
    files.push({ path: "app/Http/Controllers/Auth/AuthController.php", content:
`<?php

namespace App\\Http\\Controllers\\Auth;

use App\\Http\\Controllers\\Controller;
use App\\Models\\User;
use Illuminate\\Http\\Request;
use Illuminate\\Support\\Facades\\Auth;
use Illuminate\\Support\\Facades\\Hash;
use Illuminate\\Validation\\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        $validated = $request->validate([
            'name'     => 'required|string|max:255',
            'email'    => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $user  = User::create([
            'name'     => $validated['name'],
            'email'    => $validated['email'],
            'password' => Hash::make($validated['password']),
        ]);
        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json(['user' => $user, 'token' => $token], 201);
    }

    public function login(Request $request)
    {
        $request->validate([
            'email'    => 'required|email',
            'password' => 'required',
        ]);

        if (!Auth::attempt($request->only('email', 'password'))) {
            throw ValidationException::withMessages(['email' => ['Kimlik bilgileri hatalı.']]);
        }

        $user  = Auth::user();
        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json(['user' => $user, 'token' => $token]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Çıkış başarılı.']);
    }

    public function me(Request $request)
    {
        return response()->json($request->user());
    }
}
` });

    files.push({ path: "app/Models/User.php", content:
`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;
use Illuminate\\Foundation\\Auth\\User as Authenticatable;
use Illuminate\\Notifications\\Notifiable;
use Laravel\\Sanctum\\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = ['name', 'email', 'password'];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password'          => 'hashed',
        ];
    }
}
` });
  }

  files.push({ path: `database/migrations/0001_01_01_000000_create_users_table.php`, content:
`<?php

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->rememberToken();
            $table->timestamps();
        });

        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('sessions');
    }
};
` });

  if (hasDocker) {
    files.push({ path: "Dockerfile", content:
`FROM php:8.3-fpm-alpine

RUN apk add --no-cache nginx supervisor curl zip unzip git \\
    && docker-php-ext-install pdo pdo_${db === "postgresql" ? "pgsql pgsql" : "mysql"} opcache

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html
COPY . .

RUN composer install --no-dev --optimize-autoloader \\
    && php artisan key:generate \\
    && php artisan storage:link \\
    && chown -R www-data:www-data storage bootstrap/cache

EXPOSE 8000
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]
` });

    const dbService = db === "postgresql"
      ? `  db:\n    image: postgres:16-alpine\n    environment:\n      POSTGRES_DB: ${s.replace(/-/g,"_")}\n      POSTGRES_USER: codega\n      POSTGRES_PASSWORD: secret\n    ports:\n      - "5432:5432"\n    volumes:\n      - db_data:/var/lib/postgresql/data`
      : `  db:\n    image: mysql:8.0\n    environment:\n      MYSQL_DATABASE: ${s.replace(/-/g,"_")}\n      MYSQL_USER: codega\n      MYSQL_PASSWORD: secret\n      MYSQL_ROOT_PASSWORD: rootsecret\n    ports:\n      - "3306:3306"\n    volumes:\n      - db_data:/var/lib/mysql`;

    files.push({ path: "docker-compose.yml", content:
`version: '3.8'
services:
  app:
    build: .
    ports:
      - "8000:8000"
    environment:
      - APP_ENV=local
      - DB_HOST=db
    depends_on:
      - db
    volumes:
      - .:/var/www/html
${dbService}

volumes:
  db_data:
` });
  }

  if (hasCi) {
    files.push({ path: ".github/workflows/ci.yml", content:
`name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: secret
          MYSQL_DATABASE: ${s.replace(/-/g,"_")}_test
        options: --health-cmd="mysqladmin ping" --health-interval=10s

    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.3'
          extensions: mbstring, pdo, pdo_mysql
      - run: composer install --prefer-dist --no-progress
      - run: cp .env.example .env && php artisan key:generate
      - run: php artisan migrate --force
${hasTests ? "      - run: php artisan test" : ""}
` });
  }

  if (hasTests) {
    files.push({ path: "tests/Feature/AuthTest.php", content:
`<?php

namespace Tests\\Feature;

use App\\Models\\User;
use Illuminate\\Foundation\\Testing\\RefreshDatabase;
use Tests\\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_register(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name'                  => 'Test Kullanıcı',
            'email'                 => 'test@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response->assertStatus(201)->assertJsonStructure(['user', 'token']);
    }

    public function test_user_can_login(): void
    {
        $user = User::factory()->create(['password' => bcrypt('password123')]);

        $response = $this->postJson('/api/auth/login', [
            'email'    => $user->email,
            'password' => 'password123',
        ]);

        $response->assertOk()->assertJsonStructure(['user', 'token']);
    }

    public function test_status_endpoint(): void
    {
        $this->getJson('/api/status')->assertOk()->assertJson(['status' => 'ok']);
    }
}
` });
  }

  files.push({ path: "README.md", content:
`# ${name}

${description || `${name} — CODEGA AI Builder tarafından oluşturuldu.`}

## Stack

- PHP 8.3 / Laravel 11
- Database: ${db.toUpperCase()}
${hasAuth ? "- Auth: Laravel Sanctum (API Token)\n" : ""}\
${hasDocker ? "- Docker + Docker Compose\n" : ""}
## Kurulum

\`\`\`bash
cp .env.example .env
composer install
php artisan key:generate
php artisan migrate
php artisan serve
\`\`\`
${hasDocker ? `
## Docker ile Çalıştır

\`\`\`bash
docker-compose up -d
\`\`\`
` : ""}
## API Endpoint'leri

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | /api/status | Sağlık kontrolü |
${hasAuth ? `| POST | /api/auth/register | Kayıt |
| POST | /api/auth/login | Giriş |
| POST | /api/auth/logout | Çıkış (auth gerekli) |
| GET | /api/auth/me | Mevcut kullanıcı (auth gerekli) |` : ""}

---
*CODEGA AI Builder Engine v1 tarafından üretildi.*
` });

  return files;
}

// ─────────────────────────────────────────────────────────────
// GENERATOR: Express
// ─────────────────────────────────────────────────────────────

function generateExpress({ name, features, database, description }) {
  const s = slug(name);
  const db = database || "postgresql";
  const hasAuth   = features.includes("auth");
  const hasDocker = features.includes("docker");
  const hasCi     = features.includes("ci");
  const hasTests  = features.includes("tests");
  const files = [];

  files.push({ path: "package.json", content: JSON.stringify({
    name: s, version: "1.0.0",
    description: description || `${name} REST API`,
    main: "src/index.js",
    scripts: {
      start: "node src/index.js",
      dev: "nodemon src/index.js",
      ...(hasTests ? { test: "jest --coverage" } : {}),
    },
    dependencies: {
      express: "^4.19.2",
      cors: "^2.8.5",
      helmet: "^7.1.0",
      dotenv: "^16.4.5",
      bcryptjs: "^2.4.3",
      jsonwebtoken: "^9.0.2",
      "@prisma/client": "^5.14.0",
      "express-validator": "^7.1.0",
      morgan: "^1.10.0",
    },
    devDependencies: {
      prisma: "^5.14.0",
      nodemon: "^3.1.3",
      ...(hasTests ? { jest: "^29.7.0", supertest: "^7.0.0" } : {}),
    },
  }, null, 2) });

  files.push({ path: ".env.example", content:
`NODE_ENV=development
PORT=3000
DATABASE_URL="${db === "postgresql" ? `postgresql://codega:secret@localhost:5432/${s.replace(/-/g,"_")}` : `mysql://codega:secret@localhost:3306/${s.replace(/-/g,"_")}`}"
JWT_SECRET=change_this_super_secret_key_in_production
JWT_EXPIRES_IN=7d
` });

  files.push({ path: ".gitignore", content: `node_modules\n.env\ndist\ncoverage\n*.log\n` });

  files.push({ path: "prisma/schema.prisma", content:
`generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "${db === "postgresql" ? "postgresql" : "mysql"}"
  url      = env("DATABASE_URL")
}

model User {
  id        Int      @id @default(autoincrement())
  name      String
  email     String   @unique
  password  String
  role      String   @default("user")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("users")
}
` });

  files.push({ path: "src/index.js", content:
`require("dotenv").config();
const app = require("./app");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(\`🚀 ${name} API çalışıyor: http://localhost:\${PORT}\`);
});
` });

  files.push({ path: "src/app.js", content:
`const express    = require("express");
const cors       = require("cors");
const helmet     = require("helmet");
const morgan     = require("morgan");
const authRoutes = require("./routes/auth");
const { notFound, errorHandler } = require("./middleware/errors");

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/status", (_, res) => res.json({ status: "ok", app: "${name}", version: "1.0.0" }));
${hasAuth ? 'app.use("/api/auth", authRoutes);' : ""}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
` });

  if (hasAuth) {
    files.push({ path: "src/routes/auth.js", content:
`const router    = require("express").Router();
const { body }  = require("express-validator");
const { register, login, me } = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");
const { validate } = require("../middleware/validate");

router.post("/register",
  [body("name").trim().notEmpty(), body("email").isEmail(), body("password").isLength({ min: 8 })],
  validate, register);

router.post("/login",
  [body("email").isEmail(), body("password").notEmpty()],
  validate, login);

router.get("/me", authenticate, me);

module.exports = router;
` });

    files.push({ path: "src/controllers/authController.js", content:
`const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const prisma  = new PrismaClient();

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });

exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ message: "Bu e-posta zaten kayıtlı." });

    const hashed = await bcrypt.hash(password, 12);
    const user   = await prisma.user.create({ data: { name, email, password: hashed } });
    const token  = signToken(user.id);

    res.status(201).json({ user: { id: user.id, name: user.name, email: user.email }, token });
  } catch (err) { next(err); }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ message: "Kimlik bilgileri hatalı." });

    const token = signToken(user.id);
    res.json({ user: { id: user.id, name: user.name, email: user.email }, token });
  } catch (err) { next(err); }
};

exports.me = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, name: true, email: true, role: true, createdAt: true } });
    res.json(user);
  } catch (err) { next(err); }
};
` });

    files.push({ path: "src/middleware/auth.js", content:
`const jwt = require("jsonwebtoken");

exports.authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer "))
    return res.status(401).json({ message: "Yetkilendirme gerekli." });

  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch {
    res.status(401).json({ message: "Geçersiz veya süresi dolmuş token." });
  }
};
` });
  }

  files.push({ path: "src/middleware/errors.js", content:
`exports.notFound = (req, res) => res.status(404).json({ message: \`\${req.originalUrl} bulunamadı.\` });

exports.errorHandler = (err, _req, res, _next) => {
  const status = err.statusCode || 500;
  res.status(status).json({ message: err.message || "Sunucu hatası." });
};
` });

  files.push({ path: "src/middleware/validate.js", content:
`const { validationResult } = require("express-validator");

exports.validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};
` });

  if (hasDocker) {
    files.push({ path: "Dockerfile", content:
`FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate
EXPOSE 3000
CMD ["node", "src/index.js"]
` });

    const dbService = db === "postgresql"
      ? `  db:\n    image: postgres:16-alpine\n    environment:\n      POSTGRES_DB: ${s.replace(/-/g,"_")}\n      POSTGRES_USER: codega\n      POSTGRES_PASSWORD: secret\n    ports:\n      - "5432:5432"`
      : `  db:\n    image: mysql:8.0\n    environment:\n      MYSQL_DATABASE: ${s.replace(/-/g,"_")}\n      MYSQL_USER: codega\n      MYSQL_PASSWORD: secret\n      MYSQL_ROOT_PASSWORD: rootsecret\n    ports:\n      - "3306:3306"`;

    files.push({ path: "docker-compose.yml", content:
`version: '3.8'
services:
  api:
    build: .
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: "${db === "postgresql" ? `postgresql://codega:secret@db:5432/${s.replace(/-/g,"_")}` : `mysql://codega:secret@db:3306/${s.replace(/-/g,"_")}`}"
      JWT_SECRET: change_in_production
    depends_on: [db]
${dbService}

volumes:
  db_data:
` });
  }

  if (hasTests) {
    files.push({ path: "tests/auth.test.js", content:
`const request = require("supertest");
const app     = require("../src/app");

describe("Auth API", () => {
  it("POST /api/auth/register → 201", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Test", email: "test@codega.com", password: "password123",
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("token");
  });

  it("GET /api/status → ok", async () => {
    const res = await request(app).get("/api/status");
    expect(res.body.status).toBe("ok");
  });
});
` });
  }

  if (hasCi) {
    files.push({ path: ".github/workflows/ci.yml", content:
`name: CI
on:
  push: { branches: [main, develop] }
  pull_request: { branches: [main] }
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: cp .env.example .env
${hasTests ? "      - run: npm test" : ""}
` });
  }

  files.push({ path: "README.md", content:
`# ${name}

${description || `${name} REST API — CODEGA AI Builder tarafından oluşturuldu.`}

## Stack

- Node.js 20 / Express 4
- Prisma ORM / ${db.toUpperCase()}
${hasAuth ? "- JWT Auth (jsonwebtoken + bcryptjs)\n" : ""}\
${hasDocker ? "- Docker + Docker Compose\n" : ""}
## Kurulum

\`\`\`bash
npm install
cp .env.example .env
# .env içindeki DATABASE_URL'yi düzenle
npx prisma migrate dev --name init
npm run dev
\`\`\`

## API Endpoint'leri

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | /api/status | Sağlık kontrolü |
${hasAuth ? `| POST | /api/auth/register | Kayıt |
| POST | /api/auth/login | Giriş → JWT token |
| GET | /api/auth/me | Mevcut kullanıcı |` : ""}

---
*CODEGA AI Builder Engine v1*
` });

  return files;
}

// ─────────────────────────────────────────────────────────────
// GENERATOR: React + Vite
// ─────────────────────────────────────────────────────────────

function generateReact({ name, features, description }) {
  const s = slug(name);
  const S = studly(name);
  const hasDocker = features.includes("docker");
  const hasCi     = features.includes("ci");
  const hasTests  = features.includes("tests");
  const files = [];

  files.push({ path: "package.json", content: JSON.stringify({
    name: s, version: "0.1.0", private: true,
    scripts: { dev: "vite", build: "vite build", preview: "vite preview", ...(hasTests ? { test: "vitest run" } : {}) },
    dependencies: { react: "^18.3.1", "react-dom": "^18.3.1", "react-router-dom": "^6.24.0", axios: "^1.7.2" },
    devDependencies: {
      "@vitejs/plugin-react": "^4.3.1",
      vite: "^5.3.1",
      "@types/react": "^18.3.3",
      "@types/react-dom": "^18.3.0",
      tailwindcss: "^3.4.4",
      autoprefixer: "^10.4.19",
      postcss: "^8.4.39",
      ...(hasTests ? { vitest: "^1.6.0", "@testing-library/react": "^16.0.0", "@testing-library/jest-dom": "^6.4.6", jsdom: "^24.1.0" } : {}),
    },
  }, null, 2) });

  files.push({ path: "index.html", content:
`<!DOCTYPE html>
<html lang="tr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
` });

  files.push({ path: "vite.config.js", content:
`import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
` });

  files.push({ path: "tailwind.config.js", content:
`export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
` });

  files.push({ path: "src/main.jsx", content:
`import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
` });

  files.push({ path: "src/index.css", content:
`@tailwind base;
@tailwind components;
@tailwind utilities;
` });

  files.push({ path: "src/App.jsx", content:
`import { Routes, Route, Link } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow px-6 py-3 flex gap-4">
        <Link to="/" className="font-semibold text-indigo-600">${name}</Link>
        <Link to="/login" className="text-gray-600 hover:text-indigo-600">Giriş</Link>
      </nav>
      <main className="container mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </main>
    </div>
  );
}
` });

  files.push({ path: "src/pages/Home.jsx", content:
`export default function Home() {
  return (
    <div className="text-center py-16">
      <h1 className="text-4xl font-bold text-gray-800 mb-4">${name}</h1>
      <p className="text-gray-500">${description || "CODEGA AI Builder tarafından oluşturuldu."}</p>
    </div>
  );
}
` });

  files.push({ path: "src/pages/Login.jsx", content:
`import { useState } from 'react';
import axios from 'axios';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const { data } = await axios.post('/api/auth/login', form);
      localStorage.setItem('token', data.token);
      window.location.href = '/';
    } catch (err) {
      setError(err.response?.data?.message || 'Giriş başarısız.');
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-xl shadow p-8">
      <h2 className="text-2xl font-bold mb-6">Giriş Yap</h2>
      {error && <p className="bg-red-50 text-red-600 p-3 rounded mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <input type="email" placeholder="E-posta" value={form.email}
          onChange={e => setForm(p => ({...p, email: e.target.value}))}
          className="w-full border rounded-lg px-4 py-2" required />
        <input type="password" placeholder="Şifre" value={form.password}
          onChange={e => setForm(p => ({...p, password: e.target.value}))}
          className="w-full border rounded-lg px-4 py-2" required />
        <button type="submit" disabled={loading}
          className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
        </button>
      </form>
    </div>
  );
}
` });

  files.push({ path: "src/api/client.js", content:
`import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = \`Bearer \${token}\`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
` });

  files.push({ path: ".gitignore", content: `node_modules\ndist\n.env\n*.local\n` });

  if (hasDocker) {
    files.push({ path: "Dockerfile", content:
`FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
` });
    files.push({ path: "nginx.conf", content:
`server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
    location /api/ { proxy_pass http://api:3000/api/; }
}
` });
  }

  if (hasCi) {
    files.push({ path: ".github/workflows/ci.yml", content:
`name: CI
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
${hasTests ? "      - run: npm test\n" : ""}\
      - run: npm run build
` });
  }

  if (hasTests) {
    files.push({ path: "src/pages/Home.test.jsx", content:
`import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Home from './Home';

test('başlık gösteriliyor', () => {
  render(<BrowserRouter><Home /></BrowserRouter>);
  expect(screen.getByRole('heading')).toBeInTheDocument();
});
` });
  }

  files.push({ path: "README.md", content:
`# ${name}

${description || `${name} — CODEGA AI Builder tarafından oluşturuldu.`}

## Stack

- React 18 + Vite 5
- React Router v6
- Tailwind CSS
- Axios

## Kurulum

\`\`\`bash
npm install
npm run dev
\`\`\`

Uygulama: http://localhost:5173

---
*CODEGA AI Builder Engine v1*
` });

  return files;
}

// ─────────────────────────────────────────────────────────────
// GENERATOR: Vue 3 + Vite
// ─────────────────────────────────────────────────────────────

function generateVue({ name, features, description }) {
  const s = slug(name);
  const hasDocker = features.includes("docker");
  const hasCi     = features.includes("ci");
  const files = [];

  files.push({ path: "package.json", content: JSON.stringify({
    name: s, version: "0.1.0", private: true,
    scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
    dependencies: { vue: "^3.4.29", "vue-router": "^4.3.3", pinia: "^2.1.7", axios: "^1.7.2" },
    devDependencies: { "@vitejs/plugin-vue": "^5.0.5", vite: "^5.3.1", tailwindcss: "^3.4.4", autoprefixer: "^10.4.19", postcss: "^8.4.39" },
  }, null, 2) });

  files.push({ path: "index.html", content: `<!DOCTYPE html>\n<html lang="tr">\n  <head><meta charset="UTF-8" /><title>${name}</title></head>\n  <body><div id="app"></div><script type="module" src="/src/main.js"></script></body>\n</html>\n` });

  files.push({ path: "vite.config.js", content: `import { defineConfig } from 'vite';\nimport vue from '@vitejs/plugin-vue';\nexport default defineConfig({ plugins: [vue()], server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } } });\n` });

  files.push({ path: "src/main.js", content:
`import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './style.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
` });

  files.push({ path: "src/style.css", content: `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n` });

  files.push({ path: "src/App.vue", content:
`<template>
  <div class="min-h-screen bg-gray-50">
    <nav class="bg-white shadow px-6 py-3 flex gap-4">
      <RouterLink to="/" class="font-semibold text-indigo-600">${name}</RouterLink>
      <RouterLink to="/login" class="text-gray-600 hover:text-indigo-600">Giriş</RouterLink>
    </nav>
    <main class="container mx-auto px-4 py-8">
      <RouterView />
    </main>
  </div>
</template>
` });

  files.push({ path: "src/router/index.js", content:
`import { createRouter, createWebHistory } from 'vue-router';
import Home from '../views/HomeView.vue';
import Login from '../views/LoginView.vue';

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Home },
    { path: '/login', component: Login },
  ],
});
` });

  files.push({ path: "src/views/HomeView.vue", content:
`<template>
  <div class="text-center py-16">
    <h1 class="text-4xl font-bold text-gray-800 mb-4">${name}</h1>
    <p class="text-gray-500">${description || "CODEGA AI Builder tarafından oluşturuldu."}</p>
  </div>
</template>
` });

  files.push({ path: "src/stores/auth.js", content:
`import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import axios from 'axios';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '');
  const user  = ref(null);

  const isLoggedIn = computed(() => !!token.value);

  async function login(email, password) {
    const { data } = await axios.post('/api/auth/login', { email, password });
    token.value = data.token;
    user.value  = data.user;
    localStorage.setItem('token', data.token);
    axios.defaults.headers.common['Authorization'] = \`Bearer \${data.token}\`;
  }

  function logout() {
    token.value = '';
    user.value  = null;
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  }

  return { token, user, isLoggedIn, login, logout };
});
` });

  files.push({ path: "src/views/LoginView.vue", content:
`<template>
  <div class="max-w-md mx-auto bg-white rounded-xl shadow p-8">
    <h2 class="text-2xl font-bold mb-6">Giriş Yap</h2>
    <p v-if="error" class="bg-red-50 text-red-600 p-3 rounded mb-4">{{ error }}</p>
    <form @submit.prevent="handleSubmit" class="space-y-4">
      <input v-model="form.email" type="email" placeholder="E-posta" class="w-full border rounded-lg px-4 py-2" required />
      <input v-model="form.password" type="password" placeholder="Şifre" class="w-full border rounded-lg px-4 py-2" required />
      <button type="submit" :disabled="loading" class="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
        {{ loading ? 'Giriş yapılıyor...' : 'Giriş Yap' }}
      </button>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const auth    = useAuthStore();
const router  = useRouter();
const form    = ref({ email: '', password: '' });
const error   = ref('');
const loading = ref(false);

const handleSubmit = async () => {
  loading.value = true; error.value = '';
  try {
    await auth.login(form.value.email, form.value.password);
    router.push('/');
  } catch (e) {
    error.value = e.response?.data?.message || 'Giriş başarısız.';
  } finally { loading.value = false; }
};
</script>
` });

  files.push({ path: ".gitignore", content: `node_modules\ndist\n.env\n*.local\n` });

  if (hasDocker) {
    files.push({ path: "Dockerfile", content: `FROM node:20-alpine AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\n\nFROM nginx:alpine\nCOPY --from=build /app/dist /usr/share/nginx/html\nEXPOSE 80\n` });
  }

  if (hasCi) {
    files.push({ path: ".github/workflows/ci.yml", content: `name: CI\non:\n  push: { branches: [main] }\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with: { node-version: '20', cache: 'npm' }\n      - run: npm ci && npm run build\n` });
  }

  files.push({ path: "README.md", content: `# ${name}\n\n${description || "CODEGA AI Builder tarafından oluşturuldu."}\n\n## Stack\n\n- Vue 3 + Vite 5\n- Vue Router 4 + Pinia\n- Tailwind CSS\n\n## Kurulum\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\n---\n*CODEGA AI Builder Engine v1*\n` });

  return files;
}

// ─────────────────────────────────────────────────────────────
// GENERATOR: Next.js 14
// ─────────────────────────────────────────────────────────────

function generateNextjs({ name, features, database, description }) {
  const s = slug(name);
  const S = studly(name);
  const db = database || "postgresql";
  const hasDocker = features.includes("docker");
  const hasCi     = features.includes("ci");
  const files = [];

  files.push({ path: "package.json", content: JSON.stringify({
    name: s, version: "0.1.0", private: true,
    scripts: { dev: "next dev", build: "next build", start: "next start", lint: "next lint" },
    dependencies: {
      next: "14.2.4", react: "^18", "react-dom": "^18",
      "@prisma/client": "^5.14.0",
      "next-auth": "^4.24.7",
      bcryptjs: "^2.4.3",
    },
    devDependencies: {
      typescript: "^5", "@types/node": "^20", "@types/react": "^18", "@types/react-dom": "^18",
      prisma: "^5.14.0",
      tailwindcss: "^3.4.1", autoprefixer: "^10.0.1", postcss: "^8",
    },
  }, null, 2) });

  files.push({ path: "tsconfig.json", content: JSON.stringify({ compilerOptions: { target: "es5", lib: ["dom","dom.iterable","esnext"], allowJs: true, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true, module: "esnext", moduleResolution: "bundler", resolveJsonModule: true, isolatedModules: true, jsx: "preserve", incremental: true, plugins: [{ name: "next" }], paths: { "@/*": ["./src/*"] } }, include: ["next-env.d.ts","**/*.ts","**/*.tsx",".next/types/**/*.ts"], exclude: ["node_modules"] }, null, 2) });

  files.push({ path: "next.config.mjs", content: `/** @type {import('next').NextConfig} */\nconst nextConfig = {};\nexport default nextConfig;\n` });

  files.push({ path: "tailwind.config.js", content: `/** @type {import('tailwindcss').Config} */\nmodule.exports = { content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'], theme: { extend: {} }, plugins: [] };\n` });

  files.push({ path: "src/app/layout.tsx", content:
`import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: '${name}', description: '${description || name}' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-gray-50">{children}</body>
    </html>
  );
}
` });

  files.push({ path: "src/app/globals.css", content: `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n` });

  files.push({ path: "src/app/page.tsx", content:
`export default function Home() {
  return (
    <main className="container mx-auto px-4 py-16 text-center">
      <h1 className="text-4xl font-bold text-gray-800 mb-4">${name}</h1>
      <p className="text-gray-500">${description || "CODEGA AI Builder tarafından oluşturuldu."}</p>
    </main>
  );
}
` });

  files.push({ path: "src/app/api/auth/[...nextauth]/route.ts", content:
`import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: { email: { type: 'email' }, password: { type: 'password' } },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({ where: { email: credentials.email } });
        if (!user) return null;
        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;
        return { id: String(user.id), name: user.name, email: user.email };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
});

export { handler as GET, handler as POST };
` });

  files.push({ path: "prisma/schema.prisma", content:
`generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "${db === "postgresql" ? "postgresql" : "mysql"}"\n  url      = env("DATABASE_URL")\n}\n\nmodel User {\n  id        Int      @id @default(autoincrement())\n  name      String\n  email     String   @unique\n  password  String\n  createdAt DateTime @default(now())\n  updatedAt DateTime @updatedAt\n\n  @@map("users")\n}\n` });

  files.push({ path: ".env.example", content: `DATABASE_URL="${db === "postgresql" ? `postgresql://codega:secret@localhost:5432/${s.replace(/-/g,"_")}` : `mysql://codega:secret@localhost:3306/${s.replace(/-/g,"_")}`}"\nNEXTAUTH_SECRET=change_this_to_a_random_secret\nNEXTAUTH_URL=http://localhost:3000\n` });
  files.push({ path: ".gitignore", content: `node_modules\n.next\ndist\n.env\n*.log\n` });

  if (hasDocker) {
    files.push({ path: "Dockerfile", content: `FROM node:20-alpine AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npx prisma generate && npm run build\n\nFROM node:20-alpine\nWORKDIR /app\nCOPY --from=build /app/.next ./.next\nCOPY --from=build /app/node_modules ./node_modules\nCOPY --from=build /app/package.json ./package.json\nEXPOSE 3000\nCMD ["npm", "start"]\n` });
  }

  if (hasCi) {
    files.push({ path: ".github/workflows/ci.yml", content: `name: CI\non:\n  push: { branches: [main] }\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with: { node-version: '20', cache: 'npm' }\n      - run: npm ci && npm run build\n` });
  }

  files.push({ path: "README.md", content: `# ${name}\n\n${description || "CODEGA AI Builder tarafından oluşturuldu."}\n\n## Stack\n\n- Next.js 14 App Router\n- TypeScript\n- Prisma ORM / ${db.toUpperCase()}\n- NextAuth.js\n- Tailwind CSS\n\n## Kurulum\n\n\`\`\`bash\nnpm install\ncp .env.example .env\nnpx prisma migrate dev --name init\nnpm run dev\n\`\`\`\n\n---\n*CODEGA AI Builder Engine v1*\n` });

  return files;
}

// ─────────────────────────────────────────────────────────────
// GENERATOR: Flutter
// ─────────────────────────────────────────────────────────────

function generateFlutter({ name, features, description }) {
  const s = slug(name);
  const S = studly(name);
  const hasCi    = features.includes("ci");
  const hasTests = features.includes("tests");
  const files = [];

  files.push({ path: "pubspec.yaml", content:
`name: ${s.replace(/-/g,"_")}
description: ${description || name}
version: 1.0.0+1

environment:
  sdk: '>=3.3.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  flutter_riverpod: ^2.5.1
  go_router: ^14.1.4
  dio: ^5.4.3+1
  shared_preferences: ^2.2.3
  flutter_secure_storage: ^9.0.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^4.0.0
  ${hasTests ? "mocktail: ^1.0.4\n  " : ""}build_runner: ^2.4.11

flutter:
  uses-material-design: true
  assets:
    - assets/images/
` });

  files.push({ path: "lib/main.dart", content:
`import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'router.dart';

void main() {
  runApp(const ProviderScope(child: ${S}App()));
}

class ${S}App extends ConsumerWidget {
  const ${S}App({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: '${name}',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF4F46E5)),
        useMaterial3: true,
      ),
      routerConfig: router,
    );
  }
}
` });

  files.push({ path: "lib/router.dart", content:
`import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
    ],
  );
});
` });

  files.push({ path: "lib/screens/home_screen.dart", content:
`import 'package:flutter/material.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('${name}'), backgroundColor: const Color(0xFF4F46E5), foregroundColor: Colors.white),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.rocket_launch, size: 80, color: Color(0xFF4F46E5)),
            const SizedBox(height: 16),
            Text('${name}', style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text('${description || "CODEGA AI Builder tarafından oluşturuldu."}', style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.grey)),
          ],
        ),
      ),
    );
  }
}
` });

  files.push({ path: "lib/screens/login_screen.dart", content:
`import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email    = TextEditingController();
  final _password = TextEditingController();
  bool _loading   = false;
  String? _error;

  Future<void> _login() async {
    setState(() { _loading = true; _error = null; });
    try {
      await ref.read(authProvider.notifier).login(_email.text, _password.text);
      if (mounted) context.go('/');
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('Giriş Yap', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 32),
              if (_error != null) Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Colors.red.shade50, borderRadius: BorderRadius.circular(8)),
                child: Text(_error!, style: TextStyle(color: Colors.red.shade700)),
              ),
              const SizedBox(height: 16),
              TextField(controller: _email, decoration: const InputDecoration(labelText: 'E-posta', border: OutlineInputBorder()), keyboardType: TextInputType.emailAddress),
              const SizedBox(height: 16),
              TextField(controller: _password, decoration: const InputDecoration(labelText: 'Şifre', border: OutlineInputBorder()), obscureText: true),
              const SizedBox(height: 24),
              SizedBox(width: double.infinity, child: ElevatedButton(
                onPressed: _loading ? null : _login,
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF4F46E5), foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 16)),
                child: _loading ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Giriş Yap'),
              )),
            ],
          ),
        ),
      ),
    );
  }
}
` });

  files.push({ path: "lib/providers/auth_provider.dart", content:
`import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AuthState { final String? token; final Map<String, dynamic>? user; const AuthState({this.token, this.user}); }

class AuthNotifier extends StateNotifier<AuthState> {
  final _dio     = Dio(BaseOptions(baseUrl: 'https://your-api.com/api'));
  final _storage = const FlutterSecureStorage();

  AuthNotifier() : super(const AuthState());

  Future<void> login(String email, String password) async {
    final res = await _dio.post('/auth/login', data: {'email': email, 'password': password});
    final token = res.data['token'] as String;
    await _storage.write(key: 'token', value: token);
    state = AuthState(token: token, user: res.data['user'] as Map<String, dynamic>);
  }

  Future<void> logout() async {
    await _storage.delete(key: 'token');
    state = const AuthState();
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) => AuthNotifier());
` });

  files.push({ path: ".gitignore", content: `# Flutter\n.dart_tool/\nbuild/\n*.iml\n.flutter-plugins\n.flutter-plugins-dependencies\n# Android\n**/android/**/gradle-wrapper.jar\n**/android/.gradle\n# iOS\n**/ios/Pods/\n` });

  if (hasCi) {
    files.push({ path: ".github/workflows/ci.yml", content: `name: Flutter CI\non:\n  push: { branches: [main] }\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: subosito/flutter-action@v2\n        with: { flutter-version: '3.22.x' }\n      - run: flutter pub get\n      - run: flutter analyze\n${hasTests ? "      - run: flutter test\n" : ""}` });
  }

  if (hasTests) {
    files.push({ path: `test/widget_test.dart`, content: `import 'package:flutter_test/flutter_test.dart';\nimport 'package:flutter_riverpod/flutter_riverpod.dart';\nimport 'package:${s.replace(/-/g,"_")}/main.dart';\n\nvoid main() {\n  testWidgets('App başlatılıyor', (tester) async {\n    await tester.pumpWidget(const ProviderScope(child: ${S}App()));\n    await tester.pump();\n  });\n}\n` });
  }

  files.push({ path: "README.md", content: `# ${name}\n\n${description || "CODEGA AI Builder tarafından oluşturuldu."}\n\n## Stack\n\n- Flutter 3 / Dart\n- Riverpod (state management)\n- GoRouter (navigation)\n- Dio (HTTP)\n\n## Kurulum\n\n\`\`\`bash\nflutter pub get\nflutter run\n\`\`\`\n\n---\n*CODEGA AI Builder Engine v1*\n` });

  return files;
}

// ─────────────────────────────────────────────────────────────
// Ana Engine
// ─────────────────────────────────────────────────────────────

const GENERATORS = {
  laravel: generateLaravel,
  express: generateExpress,
  react:   generateReact,
  vue:     generateVue,
  nextjs:  generateNextjs,
  flutter: generateFlutter,
};

/**
 * Proje iskeleti üretir ve ZIP dosyası olarak kaydeder.
 *
 * @param {object} spec
 * @param {string} spec.type      — stack türü
 * @param {string} spec.name      — proje adı
 * @param {string[]} spec.features — ["auth","docker","ci","tests","api"]
 * @param {string} [spec.database] — "mysql" | "postgresql" | "sqlite"
 * @param {string} [spec.description]
 * @param {string} outputDir      — ZIP'in yazılacağı klasör
 */
async function build(spec, outputDir) {
  const { type, name, features = [], database, description = "", entities = [] } = spec;

  if (!GENERATORS[type]) throw new Error(`Desteklenmeyen stack: ${type}. Geçerliler: ${Object.keys(GENERATORS).join(", ")}`);
  if (!name || !String(name).trim()) throw new Error("Proje adı boş olamaz");

  const t0        = Date.now();
  const generator = GENERATORS[type];
  const files     = generator({ name: String(name).trim(), features, database: database || STACKS[type]?.defaultDb || "", description, entities });

  await fsp.mkdir(outputDir, { recursive: true });
  const outName = `${slug(name)}-${type}-${Date.now()}.zip`;
  const outPath = path.join(outputDir, outName);

  let result;
  try {
    await packToZip(files, outPath);
    result = {
      outPath,
      fileName: outName,
      stack:    type,
      name:     String(name).trim(),
      fileCount: files.length,
      files:    files.map((f) => ({ path: f.path, size: Buffer.byteLength(f.content, "utf8") })),
    };
  } catch (err) {
    // Execution Memory: record failed build (non-blocking)
    try {
      const { executionMemory } = require("../memory/execution-memory");
      executionMemory.record("builder", spec, err, false, Date.now() - t0).catch(() => {});
    } catch (_e) { /* memory module must never break the main flow */ }
    throw err;
  }

  // Execution Memory: record successful build (non-blocking)
  try {
    const { executionMemory } = require("../memory/execution-memory");
    executionMemory.record("builder", spec, result, true, Date.now() - t0).catch(() => {});
  } catch (_e) { /* non-fatal */ }

  return result;
}

/** Dosya agacini onizler (ZIP olusturmaz). */
function preview(spec) {
  const { type, name, features = [], database, description = "", entities = [] } = spec;
  if (!GENERATORS[type]) throw new Error(`Desteklenmeyen stack: ${type}`);
  const files = GENERATORS[type]({ name: String(name || "project").trim(), features, database: database || "", description, entities });
  return { stack: type, name, fileCount: files.length, files: files.map((f) => f.path) };
}

module.exports = { build, preview, STACKS, generateLaravel };
