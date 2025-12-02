// Use relative URLs to work with nginx proxy and avoid mixed content issues
const API_URL = '/api';

export interface Person {
  id: number;
  name: string;
  pfp_image: string | null;
  average_score?: number | null;
}
function buildUrl(path: string): string{
  return `${API_URL}${path}`;
}

export async function getPersons(): Promise<Person[]> {
  const res = await fetch(buildUrl('/persons/'));
  if (!res.ok) throw new Error(`Failed to fetch persons: ${res.statusText}`);
  return res.json();
}

export async function getPersonById(id: number): Promise<Person> {
  const res = await fetch(buildUrl(`/persons/${id}`));
  if (!res.ok) throw new Error(`Failed to fetch person: ${res.statusText}`);
  return res.json();
}

export async function createPerson(name: string, file: File): Promise<Person> {
  const form = new FormData();
  form.append('name', name);
  form.append('file', file);
  const res = await fetch(buildUrl('/persons'), { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Falha ao criar pessoa: ${res.statusText}`);
  return res.json();
}

export async function updatePerson(personId: number, name?: string, file?: File): Promise<Person> {
  const form = new FormData();
  if (name !== undefined) form.append('name', name);
  if (file) form.append('file', file);
  const res = await fetch(buildUrl(`/persons/${personId}`), { method: 'PUT', body: form });
  if (!res.ok) throw new Error(`Falha ao atualizar pessoa: ${res.statusText}`);
  return res.json();
}

export async function deletePerson(personId: number): Promise<void> {
  const res = await fetch(buildUrl(`/persons/${personId}`), { method: 'DELETE' });
  if (!res.ok) throw new Error(`Falha ao remover pessoa: ${res.statusText}`);
}

export interface Message {
  id: number;
  message: string;
  message_score: number;
  person_id: number;
}

export async function getMessages(personId?: number): Promise<Message[]> {
  const url = personId 
    ? buildUrl(`/messages?person_id=${personId}`)
    : buildUrl('/messages');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch messages: ${res.statusText}`);
  return res.json();
}

export async function createMessage(message: string, personId: number): Promise<Message> {
  const res = await fetch(buildUrl('/messages'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, person_id: personId })
  });
  if (!res.ok) throw new Error(`Failed to create message: ${res.statusText}`);
  return res.json();
}

export async function previewScore(message: string): Promise<number> {
  const res = await fetch(buildUrl('/messages/preview-score'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });
  if (!res.ok) throw new Error(`Failed to preview score: ${res.statusText}`);
  const data = await res.json();
  return data.score;
}

export async function autocomplete(text: string, sliderState: number): Promise<string | null> {
  const res = await fetch(buildUrl('/messages/autocomplete'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, slider_state: sliderState })
  });
  if (!res.ok) throw new Error(`Failed to autocomplete: ${res.statusText}`);
  const data = await res.json();
  return (data.suggestion ?? null) as string | null;
}

