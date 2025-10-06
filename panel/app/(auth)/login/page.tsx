import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { LogIn, Swords } from 'lucide-react';
import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Iniciar sesión | Virkz Dashboard',
};

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-6 py-12 text-slate-100">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex size-20 items-center justify-center rounded-3xl border border-slate-700 bg-slate-900/80 shadow-2xl">
          <Swords className="size-10 text-panel-accent" />
        </div>
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Panel Virkz</p>
          <h1 className="text-4xl font-bold text-white">Tu base de operaciones</h1>
          <p className="max-w-lg text-base text-slate-300">
            Visualiza tus estadísticas, controla tu economía y mantente al día con los eventos especiales.
          </p>
        </div>
        <form action="/api/auth/signin/discord" method="post" className="w-full max-w-sm">
          <input type="hidden" name="callbackUrl" value="/dashboard" />
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-full bg-panel-accent px-6 py-3 text-base font-semibold text-slate-950 shadow-lg transition hover:bg-sky-400"
          >
            <LogIn className="size-5" />
            Iniciar sesión con Discord
          </button>
        </form>
        <p className="text-xs text-slate-500">
          Al continuar aceptas las políticas de uso del bot Virkz. ¿Necesitas ayuda?{' '}
          <Link href="https://discord.gg" className="text-panel-accent hover:underline">
            Contáctanos
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
