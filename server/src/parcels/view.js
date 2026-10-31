const DISPLAYED_STATUS_SQL = `CASE WHEN p.status = 'created' AND p.handover_date <= (now() AT TIME ZONE 'Africa/Johannesburg')::date THEN 'in_transit' ELSE p.status END`;

const PARCEL_FROM = `FROM parcels p
  JOIN taxi_ranks r ON r.id = p.rank_id
  JOIN stores s ON s.id = p.destination_store_id
  JOIN users u ON u.id = p.sender_id`;

function parcelColumns({ includeSender, includeSenderCodeEnc }) {
  const columns = [
    'p.id',
    'p.reference',
    'r.id AS rank_id',
    'r.name AS rank_name',
    'r.town AS rank_town',
    's.id AS store_id',
    's.name AS store_name',
    's.address AS store_address',
    'p.recipient_name',
    'p.recipient_phone',
    'p.recipient_email',
    'p.description',
    `to_char(p.handover_date, 'YYYY-MM-DD') AS handover_date`,
    `${DISPLAYED_STATUS_SQL} AS status`,
    'p.created_at',
  ];

  if (includeSender) {
    columns.push('u.full_name AS sender_full_name', 'u.phone AS sender_phone');
  }

  if (includeSenderCodeEnc) {
    columns.push('p.sender_code_part_enc');
  }

  return columns;
}

export function buildParcelSelect({ includeSender, includeSenderCodeEnc }) {
  const columns = parcelColumns({ includeSender, includeSenderCodeEnc });
  return `SELECT ${columns.join(', ')} ${PARCEL_FROM}`;
}

export function serializeParcelRow(row, { senderCodePart } = {}) {
  const parcel = {
    id: row.id,
    reference: row.reference,
    rank: { id: row.rank_id, name: row.rank_name, town: row.rank_town },
    destination_store: {
      id: row.store_id,
      name: row.store_name,
      address: row.store_address,
    },
    recipient_name: row.recipient_name,
    recipient_phone: row.recipient_phone,
    recipient_email: row.recipient_email,
    description: row.description,
    handover_date: row.handover_date,
    status: row.status,
    created_at: row.created_at,
  };

  if (row.sender_full_name !== undefined) {
    parcel.sender = {
      full_name: row.sender_full_name,
      phone: row.sender_phone,
    };
  }

  if (senderCodePart !== undefined) {
    parcel.sender_code_part = senderCodePart;
  }

  return parcel;
}

export { DISPLAYED_STATUS_SQL };
