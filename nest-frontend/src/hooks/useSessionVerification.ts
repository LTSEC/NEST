import { useEffect, useState } from 'react';
import { SessionToken, VerifiedUser, verifyTokenAgainstUserTable } from '../auth';

export const useSessionVerification = (token: SessionToken | null) => {
  const [user, setUser] = useState<VerifiedUser | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    const verify = async () => {
      if (!token) {
        setUser(null);
        return;
      }

      setLoading(true);
      try {
        const verifiedUser = await verifyTokenAgainstUserTable(token);
        if (isMounted) {
          setUser(verifiedUser);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    verify();

    return () => {
      isMounted = false;
    };
  }, [token]);

  return { user, loading };
};
