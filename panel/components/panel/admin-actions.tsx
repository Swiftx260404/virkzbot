'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, RefreshCw, Trash2 } from 'lucide-react';

async function triggerResync() {
  const res = await fetch('/api/admin/resync', { method: 'POST' });
  if (!res.ok) {
    throw new Error('Failed');
  }
  return res.json();
}

export function AdminActions() {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const handleAction = async (action: 'resync' | 'flush') => {
    try {
      setLoadingAction(action);
      await triggerResync();
      toast.success(action === 'resync' ? 'Re-sync completado.' : 'Cachés vaciadas.');
    } catch (error) {
      console.error(error);
      toast.error('Ocurrió un error al ejecutar la acción.');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <button
        onClick={() => handleAction('resync')}
        disabled={loadingAction !== null}
        className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-panel-border/70 bg-panel-border/30 px-5 py-4 text-sm font-semibold text-white transition hover:border-panel-accent/60 disabled:opacity-50"
      >
        {loadingAction === 'resync' ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        Re-sync data
      </button>
      <button
        onClick={() => handleAction('flush')}
        disabled={loadingAction !== null}
        className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-panel-border/70 bg-panel-border/30 px-5 py-4 text-sm font-semibold text-white transition hover:border-panel-accent/60 disabled:opacity-50"
      >
        {loadingAction === 'flush' ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        Vaciar cachés locales
      </button>
    </div>
  );
}
