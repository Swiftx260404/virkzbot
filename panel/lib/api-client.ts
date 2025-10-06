const baseUrl = process.env.NEXT_PUBLIC_PANEL_URL?.replace(/\/$/, '') ?? '';

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      cache: 'no-store',
      ...init,
    });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as T;
  } catch (error) {
    console.error('apiFetch error', error);
    return null;
  }
}
