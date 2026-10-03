-- Current recipient targeting can change independently of active membership status.
ALTER TYPE "AnnouncementPushDeliveryError" ADD VALUE 'RECIPIENT_OUT_OF_SCOPE';
