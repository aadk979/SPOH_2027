export function databaseSelection(arn, identifier) {
  const match = /^arn:aws:rds:([a-z0-9-]+):([0-9]{12}):db:([a-z][a-z0-9-]{0,62})$/.exec(arn ?? '');
  if (!match || match[3] !== identifier) throw new Error('Database selection is unavailable');
  return { identifier, region: match[1], snapshotPrefix: `arn:aws:rds:${match[1]}:${match[2]}:snapshot:rds:${identifier}-` };
}

/** Native automated snapshots use the database-selected API and ARN namespace, never an account list. */
export function nativeBackupPage(page, selection) {
  if (!page || !Array.isArray(page.DBSnapshots)) throw new Error('Native backup metadata is unavailable');
  return {
    RecoveryPoints: page.DBSnapshots.map(snapshot => {
      if (snapshot.DBInstanceIdentifier !== selection.identifier || snapshot.SnapshotType !== 'automated' ||
          snapshot.Encrypted !== true || !snapshot.DBSnapshotArn?.startsWith(selection.snapshotPrefix) ||
          typeof snapshot.Status !== 'string' || !snapshot.Status) {
        throw new Error('Native backup metadata does not match the selected database');
      }
      return { Status: snapshot.Status === 'available' ? 'COMPLETED' : snapshot.Status,
        CreationDate: snapshot.SnapshotCreateTime };
    }),
    ...(page.Marker === undefined ? {} : { NextToken: page.Marker }),
  };
}
