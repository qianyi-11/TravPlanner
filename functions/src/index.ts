import { initializeApp } from "firebase-admin/app";
import { createTrip } from "./trips/createTrip";
import { joinTrip } from "./membership/joinTrip";
import { resetInvite } from "./membership/resetInvite";
import { removeMember } from "./membership/removeMember";
import { leaveTrip } from "./membership/leaveTrip";
import { transferOwnership } from "./membership/transferOwnership";
import { submitCandidate } from "./candidates/submitCandidate";
import { updateSubmission } from "./candidates/updateSubmission";
import { removeSubmission } from "./candidates/removeSubmission";
import { startVoting } from "./voting/startVoting";
import { castCandidateVote } from "./voting/castCandidateVote";
import { closeVoting } from "./voting/closeVoting";
import { castOptionVote } from "./voting/castOptionVote";
import { reopenTripPhase } from "./trips/reopenTripPhase";
import { setActivityBudget } from "./budget/setActivityBudget";
import { reportFixedBooking } from "./bookings/reportFixedBooking";
import { confirmFixedBooking } from "./bookings/confirmFixedBooking";
import { changeFixedBooking } from "./bookings/changeFixedBooking";
import { proposeCriticalFact } from "./validation/proposeCriticalFact";
import { confirmCriticalFact } from "./validation/confirmCriticalFact";
import { generatePlanningCycle } from "./planning/generatePlanningCycle";
import { selectWinningOption } from "./review/selectWinningOption";
import { applyMinorEdit } from "./review/applyMinorEdit";
import { submitApproval } from "./review/submitApproval";
import { finalizeTrip } from "./review/finalizeTrip";
import { createChangeRequest } from "./changeRequests/createChangeRequest";
import { reviewChangeRequest } from "./changeRequests/reviewChangeRequest";
import { applyChangeRequest } from "./changeRequests/applyChangeRequest";

initializeApp();

export {
  createTrip,
  joinTrip,
  resetInvite,
  removeMember,
  leaveTrip,
  transferOwnership,
  submitCandidate,
  updateSubmission,
  removeSubmission,
  startVoting,
  castCandidateVote,
  closeVoting,
  castOptionVote,
  reopenTripPhase,
  setActivityBudget,
  reportFixedBooking,
  confirmFixedBooking,
  changeFixedBooking,
  proposeCriticalFact,
  confirmCriticalFact,
  generatePlanningCycle,
  selectWinningOption,
  applyMinorEdit,
  submitApproval,
  finalizeTrip,
  createChangeRequest,
  reviewChangeRequest,
  applyChangeRequest,
};
