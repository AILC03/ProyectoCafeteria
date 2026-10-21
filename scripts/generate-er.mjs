import { readFileSync, writeFileSync } from 'node:fs';
import { URL } from 'node:url';

// Deriva atributos y cardinalidades del modelo Prisma, sin conexión a BD.
const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((match) => ({
  name: match[1],
  body: match[2],
  table: match[2].match(/@@map\("([^"]+)"\)/)?.[1] ?? match[1],
}));
const names = new Map(models.map((m) => [m.name, m.table]));
const output = ['erDiagram'];
const relations = [];
for (const model of models) {
  const fields = [...model.body.matchAll(/^\s+(\w+)\s+(\w+)(\?|\[\])?([^\n]*)/gm)].map((m) => ({
    name: m[1],
    type: m[2],
    optional: m[3] === '?',
    array: m[3] === '[]',
    attributes: m[4],
  }));
  const mapped = new Map(
    fields.map((f) => [f.name, f.attributes.match(/@map\("([^"]+)"\)/)?.[1] ?? f.name]),
  );
  const foreignKeys = new Set();
  for (const field of fields.filter((f) => names.has(f.type) && !f.array)) {
    const references = field.attributes
      .match(/fields: \[([^\]]+)\]/)?.[1]
      .split(',')
      .map((s) => s.trim());
    if (!references) continue;
    for (const name of references) foreignKeys.add(name);
    const unique =
      references.length === 1 &&
      fields.find((f) => f.name === references[0])?.attributes.includes('@unique');
    relations.push(
      `  ${names.get(field.type)} ${field.optional ? 'o|' : '||'}--${unique ? 'o|' : 'o{'} ${model.table} : ${references.map((name) => mapped.get(name)).join('_')}`,
    );
  }
  const compositeId =
    model.body
      .match(/@@id\(\[([^\]]+)\]/)?.[1]
      .split(',')
      .map((s) => s.trim()) ?? [];
  output.push(`  ${model.table} {`);
  for (const field of fields.filter((f) => !names.has(f.type))) {
    const type =
      {
        BigInt: 'bigint',
        Int: 'integer',
        String: 'varchar',
        DateTime: 'timestamptz',
        Boolean: 'boolean',
        Json: 'jsonb',
      }[field.type] ?? field.type;
    const keys = [];
    if (field.attributes.includes('@id') || compositeId.includes(field.name)) keys.push('PK');
    if (foreignKeys.has(field.name)) keys.push('FK');
    if (field.attributes.includes('@unique')) keys.push('UK');
    output.push(
      `    ${type} ${mapped.get(field.name)}${keys.length ? ' ' + keys.join(', ') : ''}${field.optional ? ' "nullable"' : ''}`,
    );
  }
  output.push('  }');
}
output.push(...relations);
writeFileSync(
  new URL('../docs/database/er-diagram.mmd', import.meta.url),
  output.join('\n') + '\n',
);
