import "server-only";

import { db } from "./db";

/** The stored certificate a new one clashes with, to show side by side. */
export type DuplicateInfo = {
  id: string;
  title: string;
  typeName: string;
  reportNo: string;
  reportDate: string | null;
  identification: string | null;
  weight: string | null;
  createdAt: string;
  fileId: string | null;
};

/**
 * The live certificate with this report number from the same lab (or the same type, when the
 * type has no lab). Report numbers are unique within a lab.
 */
export async function findDuplicate(
  typeId: string,
  reportNo: string,
): Promise<DuplicateInfo | null> {
  const [row] = await db()<
    {
      id: string;
      title: string;
      type_name: string;
      report_no: string;
      report_date: string | null;
      identification: string | null;
      weight_ct: string | null;
      created_at: Date;
      file_id: string | null;
    }[]
  >`
    select c.id, c.title, t.name as type_name, c.report_no,
      to_char(c.report_date, 'YYYY-MM-DD') as report_date, c.identification,
      c.weight_ct::text as weight_ct, c.created_at,
      (select f.id from certificate_files f where f.certificate_id = c.id and f.status = 'ready'
        order by f.created_at limit 1) as file_id
    from certificates c join certificate_types t on t.id = c.type_id
    where c.deleted_at is null and lower(c.report_no) = lower(${reportNo})
      and (c.type_id = ${typeId} or t.lab_id = (select lab_id from certificate_types where id = ${typeId}))
    order by (c.type_id = ${typeId}) desc, c.created_at desc
    limit 1
  `;
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    typeName: row.type_name,
    reportNo: row.report_no,
    reportDate: row.report_date,
    identification: row.identification,
    weight: row.weight_ct === null ? null : String(Number(row.weight_ct)),
    createdAt: row.created_at.toISOString(),
    fileId: row.file_id,
  };
}
