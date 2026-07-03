"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (mode === "password") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos"
          : error.message);
      } else {
        window.location.href = "/dashboard";
      }
    } else {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        setError(error.message || error.code || JSON.stringify(error));
      } else {
        setSent(true);
      }
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-[#1a3a5c] rounded-xl mb-4">
              <span className="text-white text-2xl font-bold">GP</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Talent Intelligence</h1>
            <p className="text-sm text-gray-500 mt-1">Plataforma de Talento — Grupo GP</p>
          </div>

          {sent ? (
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Revisa tu correo</h2>
              <p className="text-sm text-gray-600">
                Enviamos un enlace de acceso a <strong>{email}</strong>.<br />
                El enlace expira en 60 minutos.
              </p>
              <button
                onClick={() => { setSent(false); setEmail(""); }}
                className="mt-6 text-sm text-[#1a3a5c] hover:underline"
              >
                Usar otro correo
              </button>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Correo corporativo
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@grupogp.com.mx"
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] focus:border-transparent"
                />
              </div>

              {mode === "password" && (
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Contraseña
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] focus:border-transparent"
                  />
                </div>
              )}

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !email || (mode === "password" && !password)}
                className="w-full bg-[#1a3a5c] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#152e4d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading
                  ? (mode === "password" ? "Entrando..." : "Enviando enlace...")
                  : (mode === "password" ? "Entrar" : "Enviar enlace de acceso")}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => { setMode(mode === "password" ? "magic" : "password"); setError(null); }}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {mode === "password"
                    ? "Prefiero recibir un enlace por correo"
                    : "Entrar con contraseña"}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          GP Talent Intelligence Platform — Uso interno
        </p>
      </div>
    </div>
  );
}
