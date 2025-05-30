// dashboard/pages/dashboard/[guildId]/levels.tsx - Fixed Import Issue
import { useState, useEffect } from 'react';
import { GetServerSideProps } from 'next';
import { getSession } from 'next-auth/react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { 
  ChartBarIcon,
  TrophyIcon,
  UserIcon,
  ClockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GiftIcon,
  PlusIcon,
  TrashIcon,
  StarIcon
} from '@heroicons/react/24/outline';

interface UserLevel {
  id: number;
  userId: string;
  level: number;
  xp: number;
  messages: number;
  voiceTime: number;
  rank: number;
  user: {
    id: string;
    username: string;
  };
}

interface LevelReward {
  id: number;
  level: number;
  roleId: string;
  description: string;
}

interface LevelData {
  leaderboard: UserLevel[];
  total: number;
  currentPage: number;
  totalPages: number;
  levelRewards: LevelReward[];
}

// Define session structure for type safety
interface AuthenticatedUser {
  hasRequiredAccess?: boolean;
}

interface AuthenticatedSession {
  user: AuthenticatedUser;
  expires: string;
}

export default function LevelsPage() {
  const router = useRouter();
  const { guildId } = router.query;
  const [data, setData] = useState<LevelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState('leaderboard');
  const [newReward, setNewReward] = useState({ level: '', roleId: '', description: '' });
  const [showAddReward, setShowAddReward] = useState(false);

  useEffect(() => {
    if (guildId && typeof guildId === 'string') {
      fetchLevelData(guildId, currentPage);
    }
  }, [guildId, currentPage]);

  const fetchLevelData = async (id: string, page: number = 1) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/dashboard/levels/${id}?page=${page}&limit=20`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch level data');
      }
      
      const levelData = await response.json();
      setData(levelData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const calculateXPForLevel = (level: number): number => {
    return level * level * 100;
  };

  const getXPProgress = (userLevel: UserLevel) => {
    const currentLevelXP = calculateXPForLevel(userLevel.level);
    const nextLevelXP = calculateXPForLevel(userLevel.level + 1);
    const progressXP = userLevel.xp - currentLevelXP;
    const neededXP = nextLevelXP - currentLevelXP;
    const percentage = Math.min((progressXP / neededXP) * 100, 100);
    
    return {
      progressXP,
      neededXP,
      percentage
    };
  };

  const formatVoiceTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const handleAddReward = async () => {
    if (!newReward.level || !newReward.roleId || !newReward.description) {
      alert('Please fill in all fields');
      return;
    }

    try {
      const response = await fetch(`/api/dashboard/levels/${guildId}/rewards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          level: parseInt(newReward.level),
          roleId: newReward.roleId,
          description: newReward.description,
        }),
      });

      if (response.ok) {
        await fetchLevelData(guildId as string, currentPage);
        setNewReward({ level: '', roleId: '', description: '' });
        setShowAddReward(false);
      } else {
        throw new Error('Failed to add level reward');
      }
    } catch (error) {
      console.error('Error adding level reward:', error);
      alert('Failed to add level reward');
    }
  };

  const handleDeleteReward = async (rewardId: number) => {
    if (!confirm('Are you sure you want to delete this level reward?')) {
      return;
    }

    try {
      const response = await fetch(`/api/dashboard/levels/${guildId}/${rewardId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchLevelData(guildId as string, currentPage);
      } else {
        throw new Error('Failed to delete level reward');
      }
    } catch (error) {
      console.error('Error deleting level reward:', error);
      alert('Failed to delete level reward');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-32 h-32 border-b-2 border-indigo-500 rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-600">Loading level data...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Error</h1>
          <p className="text-gray-600">{error || 'Level data not found'}</p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 mt-4 text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'leaderboard', name: 'Leaderboard', icon: TrophyIcon },
    { id: 'rewards', name: 'Level Rewards', icon: GiftIcon },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Level System Management | Pegasus Bot Dashboard</title>
      </Head>

      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={() => router.back()}
                className="p-2 mr-4 text-gray-400 rounded-md hover:text-gray-500"
              >
                <ChevronLeftIcon className="w-5 h-5" />
              </button>
              <ChartBarIcon className="w-6 h-6 mr-3 text-gray-400" />
              <h1 className="text-xl font-semibold text-gray-900">
                Level System Management
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 mx-auto max-w-7xl sm:px-6 lg:px-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 gap-4 mb-8 md:grid-cols-3">
          <div className="p-6 bg-white rounded-lg shadow">
            <div className="flex items-center">
              <UserIcon className="w-8 h-8 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Users</p>
                <p className="text-2xl font-semibold text-gray-900">{data.total}</p>
              </div>
            </div>
          </div>
          <div className="p-6 bg-white rounded-lg shadow">
            <div className="flex items-center">
              <TrophyIcon className="w-8 h-8 text-yellow-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Highest Level</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {data.leaderboard.length > 0 ? data.leaderboard[0].level : 0}
                </p>
              </div>
            </div>
          </div>
          <div className="p-6 bg-white rounded-lg shadow">
            <div className="flex items-center">
              <GiftIcon className="w-8 h-8 text-green-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Level Rewards</p>
                <p className="text-2xl font-semibold text-gray-900">{data.levelRewards.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-8 border-b border-gray-200">
          <nav className="flex -mb-px space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`${
                    activeTab === tab.id
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm flex items-center`}
                >
                  <Icon className="w-5 h-5 mr-2" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {/* Leaderboard Tab */}
          {activeTab === 'leaderboard' && (
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Server Leaderboard</h3>
                <p className="text-sm text-gray-600">Top users by level and XP</p>
              </div>
              <div className="overflow-hidden">
                {data.leaderboard.length === 0 ? (
                  <div className="py-12 text-center">
                    <TrophyIcon className="w-12 h-12 mx-auto text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No users found</h3>
                    <p className="mt-1 text-sm text-gray-500">No users with XP found.</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                              Rank
                            </th>
                            <th className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                              User
                            </th>
                            <th className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                              Level
                            </th>
                            <th className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                              XP Progress
                            </th>
                            <th className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                              Messages
                            </th>
                            <th className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                              Voice Time
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {data.leaderboard.map((userLevel) => {
                            const progress = getXPProgress(userLevel);
                            return (
                              <tr key={userLevel.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center">
                                    {userLevel.rank <= 3 ? (
                                      <div className="flex items-center">
                                        {userLevel.rank === 1 && <span className="text-xl text-yellow-500">🥇</span>}
                                        {userLevel.rank === 2 && <span className="text-xl text-gray-400">🥈</span>}
                                        {userLevel.rank === 3 && <span className="text-xl text-yellow-600">🥉</span>}
                                        <span className="ml-2 font-medium text-gray-900">#{userLevel.rank}</span>
                                      </div>
                                    ) : (
                                      <span className="font-medium text-gray-900">#{userLevel.rank}</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center">
                                    <UserIcon className="w-5 h-5 mr-2 text-gray-400" />
                                    <div>
                                      <div className="text-sm font-medium text-gray-900">
                                        {userLevel.user.username}
                                      </div>
                                      <div className="text-sm text-gray-500">
                                        ID: {userLevel.userId}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center">
                                    <StarIcon className="w-4 h-4 mr-1 text-yellow-400" />
                                    <span className="text-lg font-semibold text-gray-900">
                                      {userLevel.level}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="w-full h-2 bg-gray-200 rounded-full">
                                    <div 
                                      className="h-2 transition-all duration-300 bg-indigo-600 rounded-full"
                                      style={{ width: `${progress.percentage}%` }}
                                    ></div>
                                  </div>
                                  <div className="mt-1 text-xs text-gray-500">
                                    {progress.progressXP.toLocaleString()} / {progress.neededXP.toLocaleString()} XP
                                    ({progress.percentage.toFixed(1)}%)
                                  </div>
                                  <div className="text-xs text-gray-400">
                                    Total: {userLevel.xp.toLocaleString()} XP
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm text-gray-900">
                                    {userLevel.messages.toLocaleString()}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center text-sm text-gray-900">
                                    <ClockIcon className="w-4 h-4 mr-1 text-gray-400" />
                                    {formatVoiceTime(userLevel.voiceTime)}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {data.totalPages > 1 && (
                      <div className="px-4 py-3 bg-white border-t border-gray-200 sm:px-6">
                        <div className="flex items-center justify-between">
                          <div className="flex justify-between flex-1 sm:hidden">
                            <button
                              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                              disabled={currentPage === 1}
                              className="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                            >
                              Previous
                            </button>
                            <button
                              onClick={() => setCurrentPage(Math.min(data.totalPages, currentPage + 1))}
                              disabled={currentPage === data.totalPages}
                              className="relative inline-flex items-center px-4 py-2 ml-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                            >
                              Next
                            </button>
                          </div>
                          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm text-gray-700">
                                Showing page <span className="font-medium">{currentPage}</span> of{' '}
                                <span className="font-medium">{data.totalPages}</span> ({data.total} total users)
                              </p>
                            </div>
                            <div>
                              <nav className="relative z-0 inline-flex -space-x-px rounded-md shadow-sm">
                                <button
                                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                                  disabled={currentPage === 1}
                                  className="relative inline-flex items-center px-2 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-l-md hover:bg-gray-50 disabled:opacity-50"
                                >
                                  <ChevronLeftIcon className="w-5 h-5" />
                                </button>
                                <button
                                  onClick={() => setCurrentPage(Math.min(data.totalPages, currentPage + 1))}
                                  disabled={currentPage === data.totalPages}
                                  className="relative inline-flex items-center px-2 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-r-md hover:bg-gray-50 disabled:opacity-50"
                                >
                                  <ChevronRightIcon className="w-5 h-5" />
                                </button>
                              </nav>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Level Rewards Tab */}
          {activeTab === 'rewards' && (
            <div className="space-y-6">
              {/* Add Reward Section */}
              <div className="p-6 bg-white rounded-lg shadow">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Level Rewards</h3>
                  <button
                    onClick={() => setShowAddReward(!showAddReward)}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700"
                  >
                    <PlusIcon className="w-4 h-4 mr-2" />
                    Add Reward
                  </button>
                </div>

                {showAddReward && (
                  <div className="pt-4 border-t border-gray-200">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div>
                        <label className="block mb-1 text-sm font-medium text-gray-700">
                          Level
                        </label>
                        <input
                          type="number"
                          value={newReward.level}
                          onChange={(e) => setNewReward({ ...newReward, level: e.target.value })}
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder="5"
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-sm font-medium text-gray-700">
                          Role ID
                        </label>
                        <input
                          type="text"
                          value={newReward.roleId}
                          onChange={(e) => setNewReward({ ...newReward, roleId: e.target.value })}
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder="123456789012345678"
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-sm font-medium text-gray-700">
                          Description
                        </label>
                        <input
                          type="text"
                          value={newReward.description}
                          onChange={(e) => setNewReward({ ...newReward, description: e.target.value })}
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder="Level 5 Member"
                        />
                      </div>
                    </div>
                    <div className="flex mt-4 space-x-3">
                      <button
                        onClick={handleAddReward}
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md shadow-sm hover:bg-green-700"
                      >
                        Add Reward
                      </button>
                      <button
                        onClick={() => {
                          setShowAddReward(false);
                          setNewReward({ level: '', roleId: '', description: '' });
                        }}
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Rewards List */}
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h4 className="font-medium text-gray-900 text-md">Current Level Rewards</h4>
                  <p className="text-sm text-gray-600">Roles automatically assigned when users reach certain levels</p>
                </div>
                <div className="overflow-hidden">
                  {data.levelRewards.length === 0 ? (
                    <div className="py-12 text-center">
                      <GiftIcon className="w-12 h-12 mx-auto text-gray-400" />
                      <h3 className="mt-2 text-sm font-medium text-gray-900">No level rewards</h3>
                      <p className="mt-1 text-sm text-gray-500">Add rewards to motivate users to level up.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                              Level
                            </th>
                            <th className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                              Role ID
                            </th>
                            <th className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                              Description
                            </th>
                            <th className="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {data.levelRewards.map((reward) => (
                            <tr key={reward.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                  <StarIcon className="w-5 h-5 mr-2 text-yellow-400" />
                                  <span className="text-lg font-semibold text-gray-900">
                                    {reward.level}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="font-mono text-sm text-gray-900">
                                  {reward.roleId}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="text-sm text-gray-900">
                                  {reward.description}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-sm font-medium whitespace-nowrap">
                                <button
                                  onClick={() => handleDeleteReward(reward.id)}
                                  className="text-red-600 hover:text-red-900"
                                >
                                  <TrashIcon className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSession(context);

  // Type assertion for session
  const authenticatedSession = session as AuthenticatedSession | null;

  if (!authenticatedSession?.user?.hasRequiredAccess) {
    return {
      redirect: {
        destination: '/auth/signin',
        permanent: false,
      },
    };
  }

  return { props: {} };
};