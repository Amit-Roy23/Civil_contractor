import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from './api';

export interface UserSession {
  id: string;
  username: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  companyId: string;
  scopedSiteIds?: string[];
  scopedLocationIds?: string[];
}

interface AuthContextType {
  user: UserSession | null;
  activeLocationId: string | null;
  setActiveLocationId: (id: string | null) => void;
  activeFyId: string | null;
  activeFyCode: string;
  isOnline: boolean;
  loginAsDemoUser: (role: 'OWNER' | 'ENGINEER' | 'ACCOUNTANT' | 'STORE') => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const [activeFyId, setActiveFyId] = useState<string | null>(null);
  const [activeFyCode, setActiveFyCode] = useState<string>('2026-2027');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial default demo login
    loginAsDemoUser('OWNER');

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loginAsDemoUser = async (role: 'OWNER' | 'ENGINEER' | 'ACCOUNTANT' | 'STORE') => {
    try {
      let username = 'owner';
      if (role === 'ENGINEER') username = 'engineer_nh31';
      if (role === 'ACCOUNTANT') username = 'accountant';
      if (role === 'STORE') username = 'storekeeper';

      // Login to API
      const res = await api.post<{ token: string; user: any; company: any; activeFy: any }>('/auth/login', {
        username,
        password: 'Password@123',
      });

      api.setToken(res.token);
      setUser(res.user);
      if (res.activeFy) {
        setActiveFyId(res.activeFy.id);
        setActiveFyCode(res.activeFy.code);
      }
      if (res.user.scopedLocationIds && res.user.scopedLocationIds.length > 0) {
        setActiveLocationId(res.user.scopedLocationIds[0]);
      } else {
        setActiveLocationId(null); // All locations
      }
    } catch (err) {
      console.error('[Auth] Failed to login demo user:', err);
    }
  };

  const logout = () => {
    api.clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        activeLocationId,
        setActiveLocationId,
        activeFyId,
        activeFyCode,
        isOnline,
        loginAsDemoUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
