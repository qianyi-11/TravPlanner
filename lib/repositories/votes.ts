import { doc, onSnapshot } from "firebase/firestore";
import type { OptionVoteDocument, LegacyCandidateVoteDocument } from "@travel-planner/shared";
import { getFirebaseFirestore } from "@/lib/firebase/firestore";

export function candidateVoteId(planningCycle: number, candidateId: string, uid: string) {
  return `${planningCycle}_${candidateId}_${uid}`;
}

export function subscribeOwnCandidateVote(tripId: string, planningCycle: number, candidateId: string, uid: string, onData: (vote: LegacyCandidateVoteDocument | null) => void, onError?: (error: Error) => void) {
  return onSnapshot(doc(getFirebaseFirestore(), "trips", tripId, "candidateVotes", candidateVoteId(planningCycle, candidateId, uid)), (snapshot) => {
    onData(snapshot.exists() ? snapshot.data() as LegacyCandidateVoteDocument : null);
  }, onError);
}

export function subscribeOwnOptionVote(tripId: string, uid: string, onData: (vote: OptionVoteDocument | null) => void, onError?: (error: Error) => void) {
  return onSnapshot(doc(getFirebaseFirestore(), "trips", tripId, "optionVotes", uid), (snapshot) => {
    onData(snapshot.exists() ? snapshot.data() as OptionVoteDocument : null);
  }, onError);
}
