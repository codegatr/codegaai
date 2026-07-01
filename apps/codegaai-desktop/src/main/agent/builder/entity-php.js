"use strict";

/**
 * entity-php.js — Entity → gerçek Laravel 11 kodu (template değil, parametrik).
 *
 * Bir entity spec'inden migration + Eloquent model + API resource controller +
 * route üretir. Saf string üreteçler (fs yok) → test edilebilir.
 */

function colLine(field) {
  const n = field.name;
  const nul = field.nullable ? "->nullable()" : "";
  switch (field.type) {
    case "text":      return `            $table->text('${n}')${nul};`;
    case "integer":   return `            $table->integer('${n}')${nul};`;
    case "decimal":   return `            $table->decimal('${n}', 12, 2)${field.nullable ? "->nullable()" : "->default(0)"};`;
    case "boolean":   return `            $table->boolean('${n}')${field.nullable ? "->nullable()" : "->default(false)"};`;
    case "date":      return `            $table->date('${n}')${nul};`;
    case "datetime":  return `            $table->dateTime('${n}')${nul};`;
    case "foreignId": return `            $table->foreignId('${n}')${field.nullable ? "->nullable()" : ""}->constrained()->cascadeOnDelete();`;
    case "string":
    default:          return `            $table->string('${n}')${nul};`;
  }
}

// 000X_..._create_<table>_table.php — deterministik, çakışmasız sıra.
function migrationFilename(entity, index = 0) {
  const seq = String(index + 2).padStart(2, "0"); // users 01; domain 02+
  return `database/migrations/0001_01_01_0000${seq}_create_${entity.table}_table.php`;
}

function laravelMigration(entity) {
  const cols = entity.fields.map(colLine).join("\n");
  return `<?php

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('${entity.table}', function (Blueprint $table) {
            $table->id();
${cols}
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('${entity.table}');
    }
};
`;
}

function laravelModel(entity) {
  const fillable = entity.fields.map((f) => `'${f.name}'`).join(", ");
  return `<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Model;

class ${entity.model} extends Model
{
    protected $table = '${entity.table}';

    protected $fillable = [${fillable}];
}
`;
}

function validationRules(entity) {
  return entity.fields.map((f) => {
    const parts = [f.nullable ? "nullable" : "required"];
    if (f.type === "integer" || f.type === "foreignId") parts.push("integer");
    else if (f.type === "decimal") parts.push("numeric");
    else if (f.type === "boolean") parts.push("boolean");
    else if (f.type === "date" || f.type === "datetime") parts.push("date");
    else parts.push("string");
    return `            '${f.name}' => '${parts.join("|")}',`;
  }).join("\n");
}

function laravelController(entity) {
  const rules = validationRules(entity);
  return `<?php

namespace App\\Http\\Controllers;

use App\\Models\\${entity.model};
use Illuminate\\Http\\Request;

class ${entity.model}Controller extends Controller
{
    public function index()
    {
        return ${entity.model}::query()->latest()->paginate(20);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
${rules}
        ]);
        return response()->json(${entity.model}::create($data), 201);
    }

    public function show(${entity.model} $${entity.varName})
    {
        return $${entity.varName};
    }

    public function update(Request $request, ${entity.model} $${entity.varName})
    {
        $data = $request->validate([
${rules}
        ]);
        $${entity.varName}->update($data);
        return $${entity.varName};
    }

    public function destroy(${entity.model} $${entity.varName})
    {
        $${entity.varName}->delete();
        return response()->noContent();
    }
}
`;
}

function apiRouteLines(entities) {
  return entities.map((e) =>
    `Route::apiResource('${e.table.replace(/_/g, "-")}', App\\Http\\Controllers\\${e.model}Controller::class);`
  ).join("\n");
}

// camelCase tekil değişken adı (route model binding için).
function withVarName(entity) {
  const v = entity.model.charAt(0).toLowerCase() + entity.model.slice(1);
  return { ...entity, varName: v };
}

/**
 * Bir entity için TÜM Laravel dosyalarını [{path, content}] olarak döndür.
 */
function entityFiles(entity, index = 0) {
  const e = withVarName(entity);
  return [
    { path: migrationFilename(e, index), content: laravelMigration(e) },
    { path: `app/Models/${e.model}.php`, content: laravelModel(e) },
    { path: `app/Http/Controllers/${e.model}Controller.php`, content: laravelController(e) },
  ];
}

module.exports = {
  entityFiles, laravelMigration, laravelModel, laravelController,
  apiRouteLines, migrationFilename, withVarName, validationRules,
};
