import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';

export async function loadCsvSample(fileRelativePath: string, limit: number = 10): Promise<Record<string, any>[]> {
  return new Promise((resolve, reject) => {
    const results: Record<string, any>[] = [];
    const filePath = path.resolve(process.cwd(), fileRelativePath);

    if (!fs.existsSync(filePath)) {
      return reject(new Error(`Arquivo não encontrado: ${filePath}`));
    }

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => {
        if (results.length < limit) {
          results.push(data);
        }
      })
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
}
