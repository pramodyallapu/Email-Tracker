export function getZohoDc(): string {
  return process.env.ZOHO_DC ?? "com";
}

export function zohoAccountsHost(dc = getZohoDc()): string {
  return `https://accounts.zoho.${dc}`;
}

export function zohoMailHost(dc = getZohoDc()): string {
  return `https://mail.zoho.${dc}`;
}
