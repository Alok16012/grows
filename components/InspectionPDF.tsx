
import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image } from '@react-pdf/renderer';

const styles = StyleSheet.create({
    page: {
        padding: 40,
        fontSize: 10,
        color: '#333',
        fontFamily: 'Helvetica',
    },
    header: {
        marginBottom: 20,
        borderBottom: '1.5pt solid #1a9e6e',
        paddingBottom: 16,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    headerLeft: {
        flex: 1,
    },
    logoImg: {
        width: 90,
        height: 45,
        objectFit: 'contain',
        marginLeft: 16,
    },
    companyName: {
        fontSize: 20,
        fontFamily: 'Helvetica-Bold',
        color: '#1a1a18',
        marginBottom: 3,
    },
    projectName: {
        fontSize: 13,
        color: '#1a9e6e',
        fontFamily: 'Helvetica-Bold',
        marginBottom: 6,
    },
    reportLabel: {
        fontSize: 9,
        color: '#9e9b95',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 10,
    },
    headerMeta: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 10,
        gap: 16,
    },
    metaItem: {
        marginRight: 20,
        marginBottom: 4,
    },
    metaLabel: {
        color: '#9e9b95',
        fontSize: 7.5,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    metaValue: {
        fontSize: 10,
        fontFamily: 'Helvetica-Bold',
        color: '#1a1a18',
    },
    statusBadge: {
        backgroundColor: '#dcfce7',
        color: '#166534',
        padding: '4 10',
        borderRadius: 4,
        fontSize: 9,
        fontFamily: 'Helvetica-Bold',
        marginTop: 10,
        alignSelf: 'flex-start',
    },
    sectionTitle: {
        fontSize: 11,
        fontFamily: 'Helvetica-Bold',
        marginBottom: 12,
        backgroundColor: '#f0faf6',
        padding: '6 10',
        borderLeft: '3pt solid #1a9e6e',
        color: '#0d6b4a',
    },
    responseRow: {
        marginBottom: 10,
        paddingLeft: 10,
        paddingBottom: 8,
        borderBottom: '0.5pt solid #f0f0f0',
    },
    fieldLabel: {
        fontSize: 8.5,
        fontFamily: 'Helvetica-Bold',
        marginBottom: 3,
        color: '#6b6860',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    fieldValue: {
        fontSize: 10,
        lineHeight: 1.4,
        color: '#1a1a18',
    },
    footer: {
        position: 'absolute',
        bottom: 30,
        left: 40,
        right: 40,
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderTop: '0.5pt solid #e8e6e1',
        paddingTop: 8,
        color: '#9ca3af',
        fontSize: 7.5,
    }
});

interface InspectionPDFProps {
    inspection: any;
}

export const InspectionPDF: React.FC<InspectionPDFProps> = ({ inspection }) => {
    const companyName = inspection.assignment?.project?.company?.name || 'Company'
    const projectName = inspection.assignment?.project?.name || 'Project'
    const reportDate = inspection.submittedAt
        ? new Date(inspection.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
        : 'N/A'
    const approvedDate = inspection.approvedAt
        ? new Date(inspection.approvedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
        : 'N/A'

    const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/logo.png` : '/logo.png'

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerTop}>
                        {/* Top Left: Company Name, Project Name, Report Date */}
                        <View style={styles.headerLeft}>
                            <Text style={styles.companyName}>{companyName}</Text>
                            <Text style={styles.projectName}>{projectName}</Text>
                            <Text style={styles.reportLabel}>Quality Inspection Report</Text>

                            <View style={styles.headerMeta}>
                                <View style={styles.metaItem}>
                                    <Text style={styles.metaLabel}>Report Date</Text>
                                    <Text style={styles.metaValue}>{reportDate}</Text>
                                </View>
                                <View style={styles.metaItem}>
                                    <Text style={styles.metaLabel}>Approved On</Text>
                                    <Text style={styles.metaValue}>{approvedDate}</Text>
                                </View>
                                <View style={styles.metaItem}>
                                    <Text style={styles.metaLabel}>Inspector</Text>
                                    <Text style={styles.metaValue}>{inspection.submitter?.name || 'N/A'}</Text>
                                </View>
                                <View style={styles.metaItem}>
                                    <Text style={styles.metaLabel}>Report ID</Text>
                                    <Text style={styles.metaValue}>INS-{inspection.id.substring(0, 8).toUpperCase()}</Text>
                                </View>
                            </View>

                            <View style={styles.statusBadge}>
                                <Text>✓ APPROVED</Text>
                            </View>
                        </View>

                        {/* Top Right: GROWS Logo */}
                        <Image src={logoUrl} style={styles.logoImg} />
                    </View>
                </View>

                {/* Responses */}
                <Text style={styles.sectionTitle}>Inspection Details</Text>

                <View>
                    {inspection.responses
                        .sort((a: any, b: any) => a.field.displayOrder - b.field.displayOrder)
                        .map((resp: any) => (
                            <View key={resp.id} style={styles.responseRow} wrap={false}>
                                <Text style={styles.fieldLabel}>{resp.field.fieldLabel}</Text>
                                <Text style={styles.fieldValue}>
                                    {resp.field.fieldType === 'file'
                                        ? '(File attached in digital portal)'
                                        : resp.field.fieldType === 'checkbox'
                                            ? (resp.value === 'true' ? 'Yes' : 'No')
                                            : resp.value || 'Not recorded'}
                                </Text>
                            </View>
                        ))}
                </View>

                {/* Footer */}
                <View style={styles.footer} fixed>
                    <Text>{companyName}  |  {projectName}</Text>
                    <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
                    <Text>Confidential Report</Text>
                </View>
            </Page>
        </Document>
    )
}
