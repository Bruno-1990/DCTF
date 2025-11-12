import PDFDocument from 'pdfkit';
import { PdfTheme } from './PdfTheme';

type PdfDocumentInstance = InstanceType<typeof PDFDocument>;
type PdfDocumentOptions = ConstructorParameters<typeof PDFDocument>[0];

type Alignment = 'left' | 'center' | 'right';

export class PdfDocumentBuilder {
  readonly doc: PdfDocumentInstance;

  private readonly theme: PdfTheme;
  private readonly finalizePromise: Promise<Buffer>;
  private readonly chunks: Buffer[] = [];

  private titleDrawn = false;

  constructor(theme: PdfTheme, options: PdfDocumentOptions = {}) {
    this.theme = theme;
    this.doc = new PDFDocument({
      size: 'A4',
      margin: theme.spacing.margin,
      compress: true,
      ...options,
    });

    this.doc.on('data', chunk => {
      this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    this.finalizePromise = new Promise<Buffer>((resolve, reject) => {
      this.doc.on('end', () => resolve(Buffer.concat(this.chunks)));
      this.doc.on('error', reject);
    });

    this.doc.on('pageAdded', () => {
      this.drawPageBackground();
    });

    this.drawPageBackground();
  }

  addLogo(image: Buffer, width = 120) {
    try {
      this.doc.image(image, this.doc.x, this.doc.y, { width });
      this.doc.moveDown(2);
    } catch (error) {
      console.warn('Não foi possível renderizar o logotipo no PDF:', error);
    }
  }

  addTitle(title: string, subtitle?: string) {
    this.doc.moveDown(this.titleDrawn ? this.theme.spacing.section : this.theme.spacing.section / 2);
    this.doc
      .fillColor(this.theme.colors.title)
      .font(this.theme.fonts.heading)
      .fontSize(this.theme.fontSizes.title)
      .text(title, { align: 'center' });

    if (subtitle) {
      this.doc
        .moveDown(0.3)
        .font(this.theme.fonts.body)
        .fontSize(this.theme.fontSizes.subtitle)
        .fillColor(this.theme.colors.subtitle)
        .text(subtitle, { align: 'center' });
    }

    this.doc.moveDown(this.theme.spacing.section / 2);
    this.titleDrawn = true;
  }

  addCenteredText(text: string) {
    this.doc
      .font(this.theme.fonts.body)
      .fontSize(this.theme.fontSizes.body)
      .fillColor(this.theme.colors.text)
      .text(text, { align: 'center' });
    this.doc.moveDown(this.theme.spacing.paragraph);
  }

  addParagraph(text: string, options: { align?: Alignment; small?: boolean } = {}) {
    this.doc
      .font(this.theme.fonts.body)
      .fontSize(options.small ? this.theme.fontSizes.small : this.theme.fontSizes.body)
      .fillColor(this.theme.colors.text)
      .text(text, {
        align: options.align ?? 'left',
        width: this.doc.page.width - this.doc.page.margins.left - this.doc.page.margins.right,
      });
    this.doc.moveDown(this.theme.spacing.paragraph);
  }

  addSection(title: string, description?: string) {
    this.doc.moveDown(this.theme.spacing.paragraph);
    this.doc
      .fillColor(this.theme.colors.sectionHeading)
      .font(this.theme.fonts.heading)
      .fontSize(this.theme.fontSizes.section)
      .text(title.toUpperCase());

    this.drawDivider();
    this.doc.moveDown(this.theme.spacing.paragraph / 2);

    if (description) {
      this.addParagraph(description);
    } else {
      this.doc.moveDown(this.theme.spacing.paragraph / 2);
    }
  }

  addDivider() {
    this.doc.moveDown(this.theme.spacing.paragraph);
    this.drawDivider();
  }

  private drawDivider() {
    this.ensurePageSpace(12);
    const startX = this.doc.page.margins.left;
    const endX = this.doc.page.width - this.doc.page.margins.right;
    this.doc
      .moveTo(startX, this.doc.y)
      .lineTo(endX, this.doc.y)
      .strokeColor(this.theme.colors.divider)
      .lineWidth(1)
      .stroke();
    this.doc.moveDown(0.4);
  }

  addKeyValue(label: string, value: string) {
    const labelWidth = 180;
    const startX = this.doc.x;
    const startY = this.doc.y;
    const valueOptions = {
      width: this.doc.page.width - this.doc.page.margins.right - startX - labelWidth,
      align: 'left' as Alignment,
    };

    this.doc
      .font(this.theme.fonts.bold)
      .fontSize(this.theme.fontSizes.body)
      .fillColor(this.theme.colors.muted)
      .text(`${label}:`, startX, startY, { width: labelWidth });

    this.doc
      .font(this.theme.fonts.body)
      .fontSize(this.theme.fontSizes.body)
      .fillColor(this.theme.colors.text)
      .text(value, startX + labelWidth, startY, valueOptions);

    const height = Math.max(
      this.doc.heightOfString(`${label}:`, { width: labelWidth }),
      this.doc.heightOfString(value, valueOptions),
    );

    this.doc.moveDown(this.theme.spacing.paragraph / 2);
    this.doc.y = startY + height;
  }

  addKeyValueList(list: Array<{ label: string; value: string }>) {
    list.forEach(item => this.addKeyValue(item.label, item.value));
    this.doc.moveDown(this.theme.spacing.paragraph);
  }

  newPage() {
    this.doc.addPage();
  }

  async finalize(): Promise<Buffer> {
    this.doc.end();
    return this.finalizePromise;
  }

  private drawPageBackground() {
    this.doc.save();
    this.doc.rect(
      0,
      0,
      this.doc.page.width,
      this.doc.page.height,
    );
    this.doc.fill(this.theme.colors.pageBackground);
    this.doc.restore();

    this.doc
      .font(this.theme.fonts.body)
      .fontSize(this.theme.fontSizes.body)
      .fillColor(this.theme.colors.text);
  }

  private ensurePageSpace(height: number) {
    const bottomLimit = this.doc.page.height - this.doc.page.margins.bottom;
    if (this.doc.y + height > bottomLimit) {
      this.doc.addPage();
    }
  }
}

export default PdfDocumentBuilder;

