/** Perfil local del login simulado (nombre y correo). El correo también se guarda en el servidor al iniciar sesión. */
export interface Profile {
  name: string;
  email: string;
}
const KEY = "hp_profile";

export function getProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export function setProfile(p: Profile | null) {
  try {
    if (p) localStorage.setItem(KEY, JSON.stringify(p));
    else localStorage.removeItem(KEY);
  } catch {
    /* sin storage */
  }
}
