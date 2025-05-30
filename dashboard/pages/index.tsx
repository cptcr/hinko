// dashboard/pages/index.tsx
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { GetServerSideProps } from 'next';
import { getSession } from 'next-auth/react';
import Head from 'next/head';
import { ShieldCheckIcon } from '@heroicons/react/24/outline';

const ALLOWED_GUILD_ID = '554266392262737930';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;

    if (session?.user?.hasRequiredAccess) {
      // User is authenticated, redirect to dashboard
      router.push(`/dashboard/${ALLOWED_GUILD_ID}`);
    } else {
      // User needs to sign in
      router.push('/auth/signin');
    }
  }, [session, status, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Head>
        <title>Pegasus Dashboard</title>
        <meta name="description" content="Admin Dashboard for Hinko Discord Bot" />
      </Head>

      <div className="text-center">
        <ShieldCheckIcon className="w-16 h-16 mx-auto mb-4 text-indigo-600" />
        <h1 className="mb-2 text-3xl font-bold text-gray-900">Pegasus Dashboard</h1>
        <p className="mb-4 text-gray-600">Loading...</p>
        <div className="w-8 h-8 mx-auto border-b-2 border-indigo-500 rounded-full animate-spin"></div>
      </div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSession(context);

  if (session?.user?.hasRequiredAccess) {
    // User is authenticated, redirect to dashboard
    return {
      redirect: {
        destination: `/dashboard/${ALLOWED_GUILD_ID}`,
        permanent: false,
      },
    };
  }

  // User needs to sign in
  return {
    redirect: {
      destination: '/auth/signin',
      permanent: false,
    },
  };
};