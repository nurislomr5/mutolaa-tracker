"use client";

import { useOptimistic, useTransition } from "react";
import { setFollow } from "@/app/actions/social";
import { Button } from "@/components/ui/button";
import { uz } from "@/lib/i18n/uz";

export function FollowButton({ profileId, following }: { profileId: string; following: boolean }) {
  const [pending, start] = useTransition();
  const [isFollowing, setIsFollowing] = useOptimistic(following);
  return (
    <Button
      variant={isFollowing ? "secondary" : "primary"}
      disabled={pending}
      title={isFollowing ? uz.social.unfollow : undefined}
      onClick={() =>
        start(async () => {
          setIsFollowing(!isFollowing);
          await setFollow(profileId, !isFollowing);
        })
      }
    >
      {isFollowing ? `✓ ${uz.social.following}` : uz.social.follow}
    </Button>
  );
}
