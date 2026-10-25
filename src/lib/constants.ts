import type { ProgramType } from './types';

export const CATEGORIES: { id: string; label: string }[] = [
  { id: 'cafeteria', label: 'Cafetería' },
  { id: 'restaurante', label: 'Restaurante' },
  { id: 'panaderia', label: 'Panadería' },
  { id: 'hamburgueseria', label: 'Hamburguesería' },
  { id: 'heladeria', label: 'Heladería' },
  { id: 'lavadero', label: 'Lavadero de autos' },
  { id: 'peluqueria', label: 'Peluquería' },
  { id: 'barberia', label: 'Barbería' },
  { id: 'estetica', label: 'Centro de estética' },
  { id: 'gimnasio', label: 'Gimnasio' },
  { id: 'mascotas', label: 'Tienda para mascotas' },
  { id: 'indumentaria', label: 'Indumentaria' },
  { id: 'almacen', label: 'Almacén / Kiosco' },
  { id: 'farmacia', label: 'Farmacia / Perfumería' },
  { id: 'otro', label: 'Otro rubro' },
];
export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? 'Otro';

/** Sugerencias por rubro para el asistente (el comercio puede cambiar todo). */
export const CATEGORY_PRESETS: Record<string, { program: string; reward: string; type: ProgramType; stamps: number; icon: string }> = {
  cafeteria: { program: 'Café Frecuente', reward: 'Un café gratis', type: 'stamps', stamps: 8, icon: 'coffee' },
  restaurante: { program: 'Cliente de la Casa', reward: 'Postre de cortesía', type: 'stamps', stamps: 6, icon: 'star' },
  panaderia: { program: 'Docena Feliz', reward: 'Media docena de facturas', type: 'stamps', stamps: 10, icon: 'bread' },
  hamburgueseria: { program: 'Burger Club', reward: 'Una hamburguesa simple gratis', type: 'stamps', stamps: 8, icon: 'burger' },
  heladeria: { program: 'Club del Helado', reward: 'Un cuarto kilo gratis', type: 'stamps', stamps: 8, icon: 'icecream' },
  lavadero: { program: 'Lavado Frecuente', reward: 'Un lavado exterior gratis', type: 'visits', stamps: 6, icon: 'car' },
  peluqueria: { program: 'Clienta Frecuente', reward: 'Un corte de cortesía', type: 'visits', stamps: 6, icon: 'scissors' },
  barberia: { program: 'Barber Pass', reward: 'Un corte gratis', type: 'visits', stamps: 6, icon: 'scissors' },
  estetica: { program: 'Club Bienestar', reward: 'Un tratamiento facial de cortesía', type: 'visits', stamps: 5, icon: 'sparkles' },
  gimnasio: { program: 'Constancia', reward: 'Una clase especial gratis', type: 'visits', stamps: 12, icon: 'dumbbell' },
  mascotas: { program: 'Amigos Peludos', reward: 'Un baño para tu mascota', type: 'stamps', stamps: 8, icon: 'paw' },
  otro: { program: 'Cliente Frecuente', reward: 'Un beneficio de regalo', type: 'stamps', stamps: 8, icon: 'star' },
};
export const presetFor = (cat: string) => CATEGORY_PRESETS[cat] ?? CATEGORY_PRESETS.otro;

export const PROGRAM_TYPES: { id: ProgramType; label: string; description: string; feature?: string; unit: string; units: string }[] = [
  { id: 'stamps', label: 'Tarjeta de sellos', description: 'Un sello por compra elegible. Al completar la tarjeta, el cliente obtiene su premio.', unit: 'sello', units: 'sellos' },
  { id: 'visits', label: 'Tarjeta de visitas', description: 'Ideal para servicios: cuenta visitas, sin importar el importe.', unit: 'visita', units: 'visitas' },
  { id: 'points', label: 'Programa de puntos', description: 'Puntos según el importe de la compra, con topes por operación.', feature: 'points', unit: 'punto', units: 'puntos' },
  { id: 'milestones', label: 'Recompensas por hitos', description: 'Premios al alcanzar objetivos acumulados (5, 10, 20 compras…). No se descuentan.', feature: 'milestones', unit: 'compra', units: 'compras' },
];
export const programType = (t: ProgramType) => PROGRAM_TYPES.find((p) => p.id === t)!;

export const PROGRAM_STATUS: Record<string, { label: string; badge: string }> = {
  draft: { label: 'Borrador', badge: '' },
  active: { label: 'Activa', badge: 'badge-ok' },
  paused: { label: 'Pausada', badge: 'badge-warn' },
  archived: { label: 'Archivada', badge: '' },
};

export const TX_TYPE: Record<string, string> = {
  earn: 'Compra registrada',
  welcome: 'Bienvenida',
  redeem: 'Canje',
  adjust: 'Ajuste manual',
  reversal: 'Anulación',
};

export const STAMP_ICONS = ['star', 'coffee', 'heart', 'check', 'scissors', 'paw', 'burger', 'icecream', 'car', 'dumbbell', 'sparkles', 'bread'];

export const CARD_PALETTES: { bg: string; text: string; accent: string; name: string }[] = [
  { name: 'NOVANTIQ', bg: '#17191D', text: '#FFFFFF', accent: '#B7F000' },
  { name: 'Café', bg: '#3B2416', text: '#FFF6EC', accent: '#E8B77D' },
  { name: 'Bosque', bg: '#0F3D2E', text: '#F0FFF7', accent: '#7CE0A3' },
  { name: 'Océano', bg: '#0B2E4F', text: '#EEF6FF', accent: '#5CC8FF' },
  { name: 'Vino', bg: '#4A0E22', text: '#FFF0F4', accent: '#FF8FB1' },
  { name: 'Crema', bg: '#F5EBDD', text: '#2B1D12', accent: '#B45309' },
  { name: 'Coral', bg: '#FF6B4A', text: '#1A0B06', accent: '#FFFFFF' },
  { name: 'Lima', bg: '#B7F000', text: '#0B0B0D', accent: '#0B0B0D' },
];

export const PAYMENTS_NOTE = 'Los pagos de la suscripción se procesan con Mercado Pago. NOVANTIQ no almacena datos de tarjetas.';
