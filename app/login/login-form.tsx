"use client";

import { useState } from "react";
import { createClient } from "../../lib/supabase/client";
import { useRouter } from "next/navigation";
import { LogIn, Mail, Lock, LoaderCircle, AlertCircle, Eye, EyeOff } from "lucide-react";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [success, setSuccess] = useState("");
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/");
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setSuccess(
          "Conta criada! Verifique seu e-mail para confirmar o cadastro.",
        );
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erro ao processar. Tente novamente.";
      setError(
        message === "Invalid login credentials"
          ? "E-mail ou senha incorretos."
          : message === "User already registered"
            ? "Este e-mail já está cadastrado. Faça login."
            : message,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src="/brand/fruto.png" alt="" className="login-logo" />
          <img src="/brand/marca.png" alt="Açaíano" className="login-marca" />
        </div>

        <h1>{mode === "login" ? "Entrar" : "Criar conta"}</h1>
        <p className="login-subtitle">
          {mode === "login"
            ? "Acesse o painel de gestão da açaíteria."
            : "Crie sua conta para gerenciar a açaíteria."}
        </p>

        {error && (
          <div className="login-error" role="alert">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {success && (
          <div className="login-success" role="status">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label className="login-field">
            <Mail size={16} />
            <input
              type="email"
              placeholder="E-mail"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>

          <label className="login-field">
            <Lock size={16} />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Senha"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
            <button
              type="button"
              className="toggle-pw"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </label>

          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? (
              <LoaderCircle size={18} className="spin" />
            ) : (
              <LogIn size={18} />
            )}
            {mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        <div className="login-toggle">
          {mode === "login" ? (
            <p>
              Não tem conta?{" "}
              <button onClick={() => { setMode("signup"); setError(""); setSuccess(""); }}>
                Criar conta
              </button>
            </p>
          ) : (
            <p>
              Já tem conta?{" "}
              <button onClick={() => { setMode("login"); setError(""); setSuccess(""); }}>
                Entrar
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

