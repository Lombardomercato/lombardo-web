#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');

const REQUIRED_FIELDS = [
  'id_producto',
  'nombre',
  'bodega',
  'categoria',
  'subcategoria',
  'varietal',
  'pais',
  'region',
  'tipo_vino',
  'cuerpo',
  'intensidad',
  'perfil',
  'acidez',
  'taninos',
  'estilo',
  'maridaje_principal',
  'maridaje_secundario',
  'precio_venta',
  'stock_actual',
  'disponible',
  'recomendado_para_regalo',
  'recomendado_para_caja',
  'recomendado_para_club',
  'nivel',
  'descripcion_corta',
];

const FIELD_ALIASES = {
  id_producto: ['id_producto', 'id', 'producto_id', 'sku', 'codigo', 'codigo_producto'],
  nombre: ['nombre', 'producto', 'descripcion', 'nombre_producto'],
  bodega: ['bodega', 'marca', 'productor'],
  categoria: ['categoria', 'rubro', 'familia'],
  subcategoria: ['subcategoria', 'sub_categoria', 'linea', 'segmento'],
  varietal: ['varietal', 'uva', 'cepa'],
  pais: ['pais', 'origen_pais'],
  region: ['region', 'origen_region', 'provincia', 'zona'],
  tipo_vino: ['tipo_vino', 'tipo', 'estilo_vino', 'tipo_de_vino'],
  cuerpo: ['cuerpo'],
  intensidad: ['intensidad'],
  perfil: ['perfil', 'notas'],
  acidez: ['acidez'],
  taninos: ['taninos'],
  estilo: ['estilo'],
  maridaje_principal: ['maridaje_principal', 'maridaje', 'comida_principal'],
  maridaje_secundario: ['maridaje_secundario', 'comida_secundaria'],
  precio_venta: ['precio_venta', 'precio', 'precio_lista', 'pvp'],
  stock_actual: ['stock_actual', 'stock', 'existencia', 'cantidad'],
  disponible: ['disponible', 'activo', 'habilitado', 'en_stock'],
  recomendado_para_regalo: ['recomendado_para_regalo', 'regalo', 'ideal_regalo'],
  recomendado_para_caja: ['recomendado_para_caja', 'caja', 'ideal_caja'],
  recomendado_para_club: ['recomendado_para_club', 'club', 'ideal_club', 'mensualidad'],
  nivel: ['nivel', 'nivel_precio', 'segmento_precio', 'gama'],
  descripcion_corta: ['descripcion_corta', 'descripcion', 'descripcion_breve', 'nota'],
};

const normalizeKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

const parseBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  const text = String(value || '').trim().toLowerCase();
  if (!text) return fallback;
  if (['1', 'true', 'si', 'sí', 'yes', 'y', 'activo', 'disponible'].includes(text)) return true;
  if (['0', 'false', 'no', 'n', 'inactivo', 'agotado', 'sin_stock'].includes(text)) return false;
  return fallback;
};

const parseNumber = (value, fallback = 0) => {
  const sanitized = String(value ?? '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '').trim();
  if (!sanitized) return fallback;
  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseCsv = (raw) => {
  const rows = [];
  let current = '';
  let row = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(current);
    current = '';
  };

  const pushRow = () => {
    if (row.length === 1 && row[0] === '') {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    const next = raw[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      pushField();
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      pushField();
      pushRow();
      continue;
    }

    current += char;
  }

  pushField();
  pushRow();

  if (!rows.length) return [];

  const [headers, ...rest] = rows;
  const normalizedHeaders = headers.map((h) => normalizeKey(h));

  return rest.map((cells) => {
    const item = {};
    normalizedHeaders.forEach((header, index) => {
      item[header] = cells[index] ?? '';
    });
    return item;
  });
};

const findValue = (row, aliases) => {
  const rowEntries = Object.entries(row || {});
  for (const alias of aliases) {
    const key = normalizeKey(alias);
    const match = rowEntries.find(([k]) => normalizeKey(k) === key);
    if (match && String(match[1]).trim() !== '') return match[1];
  }
  return '';
};

const transformRow = (row, index) => {
  const item = {};

  for (const field of REQUIRED_FIELDS) {
    const rawValue = findValue(row, FIELD_ALIASES[field] || [field]);
    item[field] = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  }

  item.id_producto = String(item.id_producto || `fudo-${index + 1}`);
  item.nombre = String(item.nombre || 'Producto sin nombre');
  item.precio_venta = parseNumber(item.precio_venta, 0);
  item.stock_actual = parseNumber(item.stock_actual, parseBoolean(item.disponible, true) ? 1 : 0);

  const availableByStock = item.stock_actual > 0;
  item.disponible = parseBoolean(item.disponible, availableByStock) && availableByStock;

  item.recomendado_para_regalo = parseBoolean(item.recomendado_para_regalo, false);
  item.recomendado_para_caja = parseBoolean(item.recomendado_para_caja, false);
  item.recomendado_para_club = parseBoolean(item.recomendado_para_club, false);

  item.categoria = item.categoria || 'vino';
  item.tipo_vino = item.tipo_vino || 'tinto';
  item.nivel = item.nivel || 'clasico';

  return item;
};

const loadSource = async (sourcePath) => {
  const raw = await fs.readFile(sourcePath, 'utf8');
  const ext = path.extname(sourcePath).toLowerCase();

  if (ext === '.json') {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('El JSON de entrada debe ser un array de productos.');
    return parsed;
  }

  return parseCsv(raw);
};

const run = async () => {
  const sourceArg = process.argv[2] || 'vinos_lombardo_base.json';
  const outputArg = process.argv[3] || 'lombardo_stock_ai.json';

  const sourcePath = path.resolve(process.cwd(), sourceArg);
  const outputPath = path.resolve(process.cwd(), outputArg);

  const sourceRows = await loadSource(sourcePath);
  const transformed = sourceRows.map(transformRow).filter((item) => item.disponible && item.stock_actual > 0);

  await fs.writeFile(outputPath, JSON.stringify(transformed, null, 2), 'utf8');

  console.log(`Transformación completa: ${transformed.length} productos disponibles exportados a ${path.relative(process.cwd(), outputPath)}.`);
};

run().catch((error) => {
  console.error('Error transformando export de Fudo:', error.message);
  process.exit(1);
});
