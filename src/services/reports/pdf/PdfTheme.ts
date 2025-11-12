export interface PdfTheme {
  colors: {
    pageBackground: string;
    title: string;
    subtitle: string;
    text: string;
    muted: string;
    accent: string;
    sectionHeading: string;
    divider: string;
    table: {
      headerBackground: string;
      headerText: string;
      rowOdd: string;
      rowEven: string;
      border: string;
    };
    badges: {
      success: string;
      info: string;
      warning: string;
      danger: string;
    };
  };
  fonts: {
    body: string;
    heading: string;
    bold: string;
    mono: string;
  };
  fontSizes: {
    title: number;
    subtitle: number;
    section: number;
    body: number;
    small: number;
  };
  spacing: {
    margin: number;
    paragraph: number;
    section: number;
    tableRow: number;
  };
  table: {
    cellPadding: number;
    minRowHeight: number;
  };
}

export const pastelTheme: PdfTheme = {
  colors: {
    pageBackground: '#F8FBFF',
    title: '#1E3A8A',
    subtitle: '#64748B',
    text: '#1F2937',
    muted: '#475569',
    accent: '#6366F1',
    sectionHeading: '#2563EB',
    divider: '#BFDBFE',
    table: {
      headerBackground: '#E0E7FF',
      headerText: '#1E293B',
      rowOdd: '#FFFFFF',
      rowEven: '#F1F5F9',
      border: '#CBD5F5',
    },
    badges: {
      success: '#10B981',
      info: '#3B82F6',
      warning: '#F59E0B',
      danger: '#EF4444',
    },
  },
  fonts: {
    body: 'Helvetica',
    heading: 'Helvetica-Bold',
    bold: 'Helvetica-Bold',
    mono: 'Courier',
  },
  fontSizes: {
    title: 22,
    subtitle: 11,
    section: 14,
    body: 10.5,
    small: 9,
  },
  spacing: {
    margin: 50,
    paragraph: 0.6,
    section: 1.2,
    tableRow: 0.3,
  },
  table: {
    cellPadding: 8,
    minRowHeight: 22,
  },
};

export default pastelTheme;

