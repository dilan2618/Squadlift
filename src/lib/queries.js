// Consultas compartidas: se usan igual en las pantallas y al preparar el modo sin conexión,
// así la copia guardada en el teléfono coincide exactamente con lo que pide cada pantalla.
import { supabase } from './supabase'
import { load, save } from './storage'
import { isOnline } from './offline'

export const routineForWorkout = (id) => supabase.from('routines')
  .select('name, routine_exercises(*, exercise:exercises(id, name, muscle_group))').eq('id', id).maybeSingle()

export const routinesList = (uid) => supabase.from('routines')
  .select('id, name, day_of_week, routine_exercises(position, target_sets, exercise:exercises(name, muscle_group))')
  .eq('owner_id', uid).eq('archived', false).order('day_of_week', { nullsFirst: false })

export const workoutCatalog = () => supabase.from('exercises').select('id, name, muscle_group').order('name')
export const editorCatalog = () => supabase.from('exercises').select('id, name, muscle_group, equipment').order('muscle_group').order('name')

// ---------- últimas series por ejercicio (para "Anterior" sin conexión) ----------
const LAST_SETS = 'sl:last-sets'
export function rememberSets(byExercise) {
  const all = load(LAST_SETS, {})
  for (const [ex, sets] of Object.entries(byExercise)) if (sets?.length) all[ex] = sets.map(s => ({ set_number: s.set_number, reps: Number(s.reps), weight_kg: Number(s.weight_kg) }))
  save(LAST_SETS, all)
}
export function recalledSets(exIds) {
  const all = load(LAST_SETS, {})
  return Object.fromEntries(exIds.filter(id => all[id]).map(id => [id, all[id]]))
}

/** Con conexión, guarda en el teléfono lo necesario para entrenar sin internet */
let warmed = false
export async function warmOfflineCache(uid) {
  if (warmed || !isOnline()) return
  warmed = true
  try {
    const { data } = await routinesList(uid)
    await Promise.all([workoutCatalog(), editorCatalog(), ...(data || []).map(r => routineForWorkout(r.id))])
  } catch { warmed = false }
}
