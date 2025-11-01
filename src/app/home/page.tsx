
'use client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FairChainCard } from '@/components/fair-chain-card';
import { Gift, Film, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { FormEvent, useEffect, useState } from 'react';
import { useFirebase, useUser, useMemoFirebase, useDoc } from '@/firebase';
import { doc, serverTimestamp, runTransaction, Timestamp, getDoc, increment, setDoc, writeBatch, collection, getCountFromServer, query, where } from 'firebase/firestore';
import { ReferralDialog } from '@/components/referral-dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type AppSettings = {
    dailyCheckInReward?: number;
    adsEnabled?: boolean;
};

const AD_REWARD_AMOUNT = 0.5;

// New component for the ad reward offer
const AdRewardDialog = ({ open, onCancel, onContinue }: { open: boolean, onCancel: () => void, onContinue: () => void }) => (
    <AlertDialog open={open} onOpenChange={onCancel}>
        <AlertDialogContent className="bg-white">
            <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-black">
                    <Film className="h-5 w-5 text-blue-500" />
                    Watch an Ad, Earn Extra!
                </AlertDialogTitle>
                <AlertDialogDescription>
                    Watch a short ad to earn an additional {AD_REWARD_AMOUNT} FAIR. Your support helps keep Fair Chain running.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onContinue}>Continue</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
);

// New component to simulate watching an ad
const AdWatchDialog = ({ adInProgress, adCompleted }: { adInProgress: boolean, adCompleted: boolean }) => (
    <Dialog open={adInProgress}>
        <DialogContent className="bg-white text-center" hideCloseButton>
            <DialogHeader>
                 <DialogTitle className="text-black">Loading Ad...</DialogTitle>
                 <DialogDescription>Please wait while we load the ad. Do not close this window.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center h-48 gap-4">
                {adCompleted ? (
                    <>
                        <Gift className="h-16 w-16 text-green-500" />
                        <p className="font-semibold text-black">Reward Granted!</p>
                    </>
                ) : (
                    <>
                        <Loader2 className="h-16 w-16 animate-spin text-blue-500" />
                        <p className="font-semibold text-black">Watching Ad...</p>
                    </>
                )}
            </div>
        </DialogContent>
    </Dialog>
);


export default function HomePage() {
  const { toast } = useToast();
  const { firestore, user } = useFirebase();
  
  const userRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [user, firestore]);
  const { data: userData } = useDoc(userRef);

  const appSettingsRef = useMemoFirebase(() => (firestore && user ? doc(firestore, 'app_settings', 'main') : null), [firestore, user]);
  const { data: appSettings } = useDoc<AppSettings>(appSettingsRef);
  
  const lastCheckIn = userData?.lastCheckIn as Timestamp | undefined;
  
  const [timeLeft, setTimeLeft] = useState(0);
  const [claimed, setClaimed] = useState(false);

  // Ad-related state
  const [showAdOffer, setShowAdOffer] = useState(false);
  const [adInProgress, setAdInProgress] = useState(false);
  const [adCompleted, setAdCompleted] = useState(false);
  
  useEffect(() => {
    if (lastCheckIn) {
      const checkInTime = lastCheckIn.toDate();
      const interval = setInterval(() => {
        const now = new Date();
        const nextCheckInTime = new Date(checkInTime.getTime() + 24 * 60 * 60 * 1000);
        const diff = nextCheckInTime.getTime() - now.getTime();
        if (diff > 0) {
          setTimeLeft(diff);
        } else {
          setTimeLeft(0);
          clearInterval(interval);
        }
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setTimeLeft(0);
    }
  }, [lastCheckIn]);

  const formatTimeLeft = (milliseconds: number) => {
    if (milliseconds <= 0) return '00h 00m 00s';
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);
    return `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  };

  const handleDailyCheckIn = async () => {
    if (!user || !userRef || !firestore) return;
    setClaimed(true);
    setTimeout(() => setClaimed(false), 500);

    const reward = appSettings?.dailyCheckInReward || 1;

    try {
        const batch = writeBatch(firestore);

        batch.update(userRef, {
            verifiedBalance: increment(reward),
            lastCheckIn: serverTimestamp(),
        });

        const notificationsRef = collection(userRef, 'notifications');
        batch.set(doc(notificationsRef), {
            type: 'reward',
            title: 'Daily Check-in',
            description: `You earned +${reward} Fair for your daily check-in.`,
            amount: reward,
            isRead: false,
            timestamp: serverTimestamp(),
        });

        await batch.commit();

        toast({
            title: 'Checked In!',
            description: `You earned +${reward} Fair.`,
        });
        
        // After successful check-in, offer the ad if enabled from admin settings
        if (appSettings?.adsEnabled) {
            setShowAdOffer(true);
        }

    } catch (error) {
        console.error("Error during daily check-in:", error);
        toast({
            variant: 'destructive',
            title: 'Check-in Failed',
            description: 'Could not process your daily check-in. Please try again.',
        });
    }
  };

  const handleAdContinue = () => {
    setShowAdOffer(false);
    setAdInProgress(true);
    setAdCompleted(false);

    // This simulates an ad playing for 5 seconds.
    // Replace this with your actual ad SDK's "onAdComplete" callback.
    setTimeout(() => {
        handleAdReward(); // Trigger reward logic on completion
        setAdCompleted(true);
        // Close the dialog after another 2 seconds
        setTimeout(() => {
            setAdInProgress(false);
        }, 2000);
    }, 5000);
  };

  const handleAdReward = async () => {
    if (!user || !userRef || !firestore) return;

    try {
        const batch = writeBatch(firestore);

        batch.update(userRef, {
            verifiedBalance: increment(AD_REWARD_AMOUNT)
        });

        const notificationsRef = collection(userRef, 'notifications');
        batch.set(doc(notificationsRef), {
            type: 'reward',
            title: 'Ad Reward',
            description: `You earned +${AD_REWARD_AMOUNT} Fair for watching an ad.`,
            amount: AD_REWARD_AMOUNT,
            isRead: false,
            timestamp: serverTimestamp(),
        });
        
        await batch.commit();
        
        toast({
            title: 'Ad Reward Claimed!',
            description: `You earned an extra ${AD_REWARD_AMOUNT} Fair.`,
        });

    } catch (error) {
        console.error("Error granting ad reward:", error);
        toast({
            variant: 'destructive',
            title: 'Reward Failed',
            description: 'Could not grant your ad reward. Please try again.',
        });
    }
  };


  const handleClaimCode = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!firestore || !user) return;
    
    const form = e.currentTarget;
    const codeInput = form.elements.namedItem('code') as HTMLInputElement;
    const code = codeInput.value.trim().toLowerCase();
    
    if (!code) {
        toast({ variant: 'destructive', title: 'Invalid Code', description: 'Please enter a code.' });
        return;
    }

    try {
        await runTransaction(firestore, async (transaction) => {
            const codeRef = doc(firestore, 'dailyCodes', code);
            const userCodeRef = doc(firestore, 'users', user.uid, 'redeemedCodes', code);
            const userRef = doc(firestore, 'users', user.uid);
            const notificationsRef = collection(userRef, 'notifications');

            const [codeDoc, userCodeDoc] = await Promise.all([
                transaction.get(codeRef),
                transaction.get(userCodeDoc)
            ]);

            if (!codeDoc.exists()) {
                throw new Error('Invalid or expired code.');
            }

            if (userCodeDoc.exists()) {
                throw new Error('You have already redeemed this code.');
            }
            
            const codeData = codeDoc.data();
            if (codeData.validUntil.toDate() < new Date()) {
                throw new Error('This code has expired.');
            }

            transaction.update(userRef, { verifiedBalance: increment(codeData.rewardAmount) });
            transaction.set(userCodeRef, {
                userId: user.uid,
                dailyCodeId: code,
                redeemedAt: serverTimestamp()
            });

            transaction.set(doc(notificationsRef), {
                type: 'reward',
                title: 'Daily Code Redeemed',
                description: `You received +${codeData.rewardAmount} Fair from a daily code.`,
                amount: codeData.rewardAmount,
                isRead: false,
                timestamp: serverTimestamp(),
            });
            
            toast({
                title: 'Code Claimed!',
                description: `You've received ${codeData.rewardAmount} Fair.`,
            });
        });

        codeInput.value = '';
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Claim Failed',
            description: error.message || 'Could not claim the code. Please try again.',
        });
    }
  };

  const canCheckIn = timeLeft <= 0;
  
  const verifiedBalance = userData?.verifiedBalance || 0;
  const unverifiedBalance = userData?.unverifiedBalance || 0;
  const totalBalance = verifiedBalance + unverifiedBalance;

  const unverifiedReferrals = userData?.referrals?.unverified || 0;
  const verifiedReferrals = userData?.referrals?.verified || 0;
  const dailyReward = appSettings?.dailyCheckInReward || 1;

  return (
    <div className="flex flex-col h-full bg-white">
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <div className="grid gap-6">
          <div className="relative">
            <div className="absolute inset-0 texture-dotted-black z-10 pointer-events-none"></div>
            <FairChainCard balance={totalBalance} />
          </div>

          <Card>
            <CardHeader className='p-4'>
              <CardTitle className='text-base text-black'>Daily Check-In</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3 p-4 pt-0">
              {canCheckIn ? (
                <Button
                  className={`w-full text-white font-bold py-2.5 transition-all duration-300 transform ${
                    'bg-gradient-to-r from-teal-400 to-blue-500 hover:scale-105'
                  } ${claimed ? 'scale-95 bg-green-500' : ''}`}
                  onClick={handleDailyCheckIn}
                  disabled={!canCheckIn}
                >
                  <Gift className="mr-2 h-5 w-5" /> Claim +{dailyReward} Fair
                </Button>
              ) : (
                <div className='text-center text-muted-foreground font-medium text-xs bg-gray-100 px-3 py-1.5 rounded-lg'>
                  Next check-in in: <span className="font-mono">{formatTimeLeft(timeLeft)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='text-black'>Referral Program</CardTitle>
              <CardDescription>
                Earn 3 Fair for every friend who joins and gets verified.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ReferralDialog userId={user?.uid} />
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="p-3 bg-gray-100 rounded-lg">
                  <p className="text-2xl font-bold text-black">{unverifiedReferrals}</p>
                  <p className="text-sm text-gray-500">Unverified</p>
                </div>
                <div className="p-3 bg-gray-100 rounded-lg">
                  <p className="text-2xl font-bold text-black">{verifiedReferrals}</p>
                  <p className="text-sm text-gray-500">Verified</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className='text-black'>Daily Code</CardTitle>
              <CardDescription>
                Enter the daily code to claim your reward.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleClaimCode} className="flex gap-2">
                <Input name="code" type="text" placeholder="Enter code" className='text-black bg-white border-gray-300' />
                <Button type="submit" className='text-white'>Claim</Button>
              </form>
            </CardContent>
          </Card>

        </div>
      </main>
      
      {/* Ad Dialogs */}
      <AdRewardDialog 
        open={showAdOffer} 
        onCancel={() => setShowAdOffer(false)}
        onContinue={handleAdContinue}
      />
      <AdWatchDialog adInProgress={adInProgress} adCompleted={adCompleted} />
    </div>
  );
}
