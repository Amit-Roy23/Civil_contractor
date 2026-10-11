import { get, set, del } from 'idb-keyval';

export interface FormDraft<T = any> {
  formKey: string;
  data: T;
  lastSavedAt: string;
}

export async function saveDraft<T>(formKey: string, data: T): Promise<void> {
  try {
    const draft: FormDraft<T> = {
      formKey,
      data,
      lastSavedAt: new Date().toISOString(),
    };
    await set(`draft_${formKey}`, draft);
  } catch (err) {
    console.warn(`[Draft] Failed to save draft for ${formKey} in IndexedDB:`, err);
  }
}

export async function loadDraft<T>(formKey: string): Promise<FormDraft<T> | null> {
  try {
    const draft = await get<FormDraft<T>>(`draft_${formKey}`);
    return draft || null;
  } catch (err) {
    console.warn(`[Draft] Failed to load draft for ${formKey}:`, err);
    return null;
  }
}

export async function clearDraft(formKey: string): Promise<void> {
  try {
    await del(`draft_${formKey}`);
  } catch (err) {
    console.warn(`[Draft] Failed to clear draft for ${formKey}:`, err);
  }
}
