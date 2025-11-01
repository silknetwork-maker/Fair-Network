
'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Poppins } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { FirebaseClientProvider, useDoc, useMemoFirebase, useUser } from '@/firebase';
import { AppShell } from '@/components/app-shell';
import { Logo } from '@/components/icons';
import { doc } from 'firebase/firestore';
import { useFirebase } from '@/firebase/provider';
import { Hammer } from 'lucide-react';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
});

type AppSettings = {
  maintenanceModeEnabled?: boolean;
};

const MaintenancePage = () => (
    <div className="flex h-screen items-center justify-center bg-gray-100 p-4">
        <div className="text-center">
            <Logo className="h-16 w-16 text-blue-600 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-800">Under Maintenance</h1>
            <p className="mt-2 text-gray-600">The site is currently under maintenance. Please check back later.</p>
        </div>
    </div>
);


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${poppins.className} antialiased`}>
        <FirebaseClientProvider>
          <AuthWrapper>{children}</AuthWrapper>
        </FirebaseClientProvider>
        <Toaster />
      </body>
    </html>
  );
}

function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const { firestore } = useFirebase();
  const pathname = usePathname();
  const router = useRouter();
  
  const appSettingsRef = useMemoFirebase(() => (firestore && user ? doc(firestore, 'app_settings', 'main') : null), [firestore, user]);
  const { data: appSettings, isLoading: isLoadingAppSettings } = useDoc<AppSettings>(appSettingsRef);

  useEffect(() => {
    if (isUserLoading || isLoadingAppSettings) return;

    const isAuthPage = pathname === '/';
    const isAdminPage = pathname.startsWith('/admin');
    
    // Check for the fresh login flag.
    const isFreshLogin = sessionStorage.getItem('isFreshLogin') === 'true';

    let isAdmin = false;
    if (user) {
        isAdmin = user.uid === 'mgferXC25jOHmMTzpu0p2XqDbKE2';
    }

    if (user) { // User is logged in
      // If it's a fresh login, remove the flag and stay on the current page (which should be /home).
      if (isFreshLogin) {
        sessionStorage.removeItem('isFreshLogin');
        // If they somehow landed on the auth page after a fresh login, redirect to home.
        if (isAuthPage) {
          router.replace('/home');
        }
        return;
      }

      // If it's an existing session (not a fresh login) and user is on the auth page, redirect to mining.
      if (isAuthPage) {
        router.replace('/mining'); 
        return;
      }
      
      // If a non-admin tries to access admin pages, redirect them.
      if (isAdminPage && !isAdmin) {
        router.replace('/mining'); 
        return;
      }
    } else { // User is NOT logged in
      // If trying to access a protected page, redirect to the auth page.
      if (!isAuthPage) {
        router.replace('/');
        return;
      }
    }
  }, [user, isUserLoading, isLoadingAppSettings, pathname, router]);

  const loadingScreen = (
    <div className="flex h-screen items-center justify-center bg-gray-100">
        <div>
            <Logo className="h-16 w-16 text-blue-600 mx-auto mb-4" />
            <h1 className="text-2xl font-semibold text-gray-800">Welcome to Fair Chain</h1>
        </div>
    </div>
  );

  if (isUserLoading || isLoadingAppSettings) {
    return loadingScreen;
  }
  
  const isAdmin = user?.uid === 'mgferXC25jOHmMTzpu0p2XqDbKE2';
  if (appSettings?.maintenanceModeEnabled && !isAdmin) {
      return <MaintenancePage />;
  }

  const isAuthPage = pathname === '/';
  
  // Prevent content flashing during redirection
  if (user && isAuthPage) {
      return loadingScreen;
  }
  if (!user && !isAuthPage) {
      return loadingScreen;
  }
  
  if (user) {
    return <AppShell>{children}</AppShell>;
  }

  return <>{children}</>;
}
