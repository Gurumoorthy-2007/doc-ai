'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import type { Profile } from '@/lib/types';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  isDemoMode: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_DEMO_USER: User = {
  id: 'usr-demo-admin-001',
  app_metadata: {},
  user_metadata: { full_name: 'Demo User' },
  aud: 'authenticated',
  created_at: new Date().toISOString(),
  email: 'demo@docusentinel.local',
  phone: '',
  role: 'authenticated',
  updated_at: new Date().toISOString(),
};

const DEFAULT_DEMO_PROFILE: Profile = {
  id: 'usr-demo-admin-001',
  full_name: 'Demo User',
  email: 'demo@docusentinel.local',
  avatar_url: null,
  role: 'admin',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function checkIsSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && !url.includes('placeholder') && key && !key.includes('placeholder'));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(!checkIsSupabaseConfigured());

  const fetchProfile = useCallback(async (userId: string) => {
    if (!checkIsSupabaseConfigured()) {
      const stored = localStorage.getItem('ds_demo_profile');
      if (stored) {
        try {
          return JSON.parse(stored) as Profile;
        } catch {
          return DEFAULT_DEMO_PROFILE;
        }
      }
      return DEFAULT_DEMO_PROFILE;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }
      return data as Profile;
    } catch {
      return null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      const p = await fetchProfile(user.id);
      setProfile(p);
    }
  }, [user, fetchProfile]);

  useEffect(() => {
    const isConfigured = checkIsSupabaseConfigured();
    setIsDemoMode(!isConfigured);

    if (!isConfigured) {
      // Local/Demo Auth initialization
      try {
        const storedUser = localStorage.getItem('ds_demo_user');
        const storedProfile = localStorage.getItem('ds_demo_profile');
        if (storedUser && storedProfile) {
          setUser(JSON.parse(storedUser));
          setProfile(JSON.parse(storedProfile));
        } else {
          // Initialize with default demo admin
          setUser(DEFAULT_DEMO_USER);
          setProfile(DEFAULT_DEMO_PROFILE);
          localStorage.setItem('ds_demo_user', JSON.stringify(DEFAULT_DEMO_USER));
          localStorage.setItem('ds_demo_profile', JSON.stringify(DEFAULT_DEMO_PROFILE));
        }
      } catch (err) {
        console.warn('Error reading demo auth from localStorage:', err);
        setUser(DEFAULT_DEMO_USER);
        setProfile(DEFAULT_DEMO_PROFILE);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Live Supabase Auth
    const initAuth = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        if (currentSession?.user) {
          const p = await fetchProfile(currentSession.user.id);
          setProfile(p);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          const p = await fetchProfile(newSession.user.id);
          setProfile(p);
        } else {
          setProfile(null);
        }
        if (event === 'SIGNED_OUT') {
          setProfile(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    if (!checkIsSupabaseConfigured()) {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          return { error: data.error || 'Login failed' };
        }
      } catch (err) {
        console.warn('Login API error:', err);
      }

      const demoUser: User = {
        ...DEFAULT_DEMO_USER,
        id: `usr-${Date.now()}`,
        email: email.trim(),
        user_metadata: { full_name: email.split('@')[0].replace('.', ' ') },
      };
      const demoProfile: Profile = {
        id: demoUser.id,
        full_name: email.split('@')[0].replace('.', ' ').replace(/^./, (c) => c.toUpperCase()),
        email: email.trim(),
        avatar_url: null,
        role: 'admin',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setUser(demoUser);
      setProfile(demoProfile);
      try {
        localStorage.setItem('ds_demo_user', JSON.stringify(demoUser));
        localStorage.setItem('ds_demo_profile', JSON.stringify(demoProfile));
      } catch {}
      return { error: null };
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    if (!checkIsSupabaseConfigured()) {
      const demoUser: User = {
        ...DEFAULT_DEMO_USER,
        id: `usr-${Date.now()}`,
        email: email.trim(),
        user_metadata: { full_name: fullName },
      };
      const demoProfile: Profile = {
        id: demoUser.id,
        full_name: fullName,
        email: email.trim(),
        avatar_url: null,
        role: 'user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setUser(demoUser);
      setProfile(demoProfile);
      try {
        localStorage.setItem('ds_demo_user', JSON.stringify(demoUser));
        localStorage.setItem('ds_demo_profile', JSON.stringify(demoProfile));
      } catch {}
      return { error: null };
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    if (!checkIsSupabaseConfigured()) {
      setUser(null);
      setProfile(null);
      setSession(null);
      try {
        localStorage.removeItem('ds_demo_user');
        localStorage.removeItem('ds_demo_profile');
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch {}
      return;
    }

    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  const resetPassword = async (email: string) => {
    if (!checkIsSupabaseConfigured()) {
      return { error: null };
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/reset-password`,
    });
    return { error: error?.message ?? null };
  };

  const updatePassword = async (password: string) => {
    if (!checkIsSupabaseConfigured()) {
      return { error: null };
    }

    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        isDemoMode,
        signIn,
        signUp,
        signOut,
        resetPassword,
        updatePassword,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
