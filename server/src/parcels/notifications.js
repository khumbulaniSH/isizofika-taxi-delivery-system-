import { encryptString } from './codes.js';

export function buildNotificationRows({
  parcelId,
  recipientPhone,
  recipientEmail,
  recipientCodePart,
}) {
  const codePartEnc = encryptString(recipientCodePart);

  const rows = [
    {
      parcel_id: parcelId,
      channel: 'sms',
      recipient: recipientPhone,
      code_part_enc: codePartEnc,
      status: 'pending',
    },
  ];

  if (recipientEmail !== null && recipientEmail !== '') {
    rows.push({
      parcel_id: parcelId,
      channel: 'email',
      recipient: recipientEmail,
      code_part_enc: codePartEnc,
      status: 'pending',
    });
  }

  return rows;
}

export function printDevNotifications({ recipientPhone, recipientEmail, recipientCodePart }) {
  if (process.env.DEV_PRINT_NOTIFICATIONS !== 'true') {
    return;
  }

  console.log(`[DEV SMS] to ${recipientPhone}: code part ${recipientCodePart}`);

  if (recipientEmail !== null && recipientEmail !== '') {
    console.log(`[DEV EMAIL] to ${recipientEmail}: code part ${recipientCodePart}`);
  }
}
