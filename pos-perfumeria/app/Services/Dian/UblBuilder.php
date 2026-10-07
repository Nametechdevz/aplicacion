<?php
namespace App\Services\Dian;

use DOMDocument;
use DOMElement;
use DOMNode;

/**
 * Genera el XML UBL 2.1 (estructura DIAN) de factura electrónica, documento
 * equivalente POS electrónico y nota crédito, a partir del payload normalizado
 * que arma ElectronicInvoice::payload*().
 *
 * La firma digital XAdES-EPES se deja en el segundo UBLExtension: la aplica el
 * proveedor tecnológico (o un firmador propio con el certificado de la empresa).
 */
class UblBuilder
{
    private const NS = [
        'cac'   => 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
        'cbc'   => 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
        'ext'   => 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
        'sts'   => 'dian:gov:co:facturaelectronica:Structures-2-1',
        'ds'    => 'http://www.w3.org/2000/09/xmldsig#',
        'xades' => 'http://uri.etsi.org/01903/v1.3.2#',
    ];

    private DOMDocument $doc;

    public function build(array $p): string
    {
        $this->doc = new DOMDocument('1.0', 'UTF-8');
        $this->doc->formatOutput = true;
        $isCredit = $p['kind'] === 'NC';

        $rootName = $isCredit ? 'CreditNote' : 'Invoice';
        $rootNs = 'urn:oasis:names:specification:ubl:schema:xsd:' . $rootName . '-2';
        $root = $this->doc->createElementNS($rootNs, $rootName);
        $this->doc->appendChild($root);
        foreach (self::NS as $prefix => $ns) {
            $root->setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:' . $prefix, $ns);
        }

        // ---- Extensiones DIAN ----
        $exts = $this->el($root, 'ext:UBLExtensions');
        $dian = $this->el($this->el($this->el($exts, 'ext:UBLExtension'), 'ext:ExtensionContent'), 'sts:DianExtensions');
        if (!empty($p['range']) && !$isCredit) {
            $ctrl = $this->el($dian, 'sts:InvoiceControl');
            $this->el($ctrl, 'sts:InvoiceAuthorization', $p['range']['resolution_number'] ?? '');
            $period = $this->el($ctrl, 'sts:AuthorizationPeriod');
            $this->el($period, 'cbc:StartDate', $p['range']['valid_from'] ?? '');
            $this->el($period, 'cbc:EndDate', $p['range']['valid_to'] ?? '');
            $auth = $this->el($ctrl, 'sts:AuthorizedInvoices');
            if (($p['range']['prefix'] ?? '') !== '') {
                $this->el($auth, 'sts:Prefix', $p['range']['prefix']);
            }
            $this->el($auth, 'sts:From', (string) $p['range']['from_number']);
            $this->el($auth, 'sts:To', (string) $p['range']['to_number']);
        }
        $src = $this->el($dian, 'sts:InvoiceSource');
        $this->el($src, 'cbc:IdentificationCode', 'CO', ['listAgencyID' => '6', 'listAgencyName' => 'United Nations Economic Commission for Europe', 'listSchemeURI' => 'urn:oasis:names:specification:ubl:codelist:gc:CountryIdentificationCode-2.1']);
        $sp = $this->el($dian, 'sts:SoftwareProvider');
        $this->el($sp, 'sts:ProviderID', $p['issuer']['nit'], ['schemeAgencyID' => '195', 'schemeAgencyName' => 'CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)', 'schemeID' => $p['issuer']['dv'], 'schemeName' => '31']);
        $this->el($sp, 'sts:SoftwareID', $p['software']['id'], ['schemeAgencyID' => '195', 'schemeAgencyName' => 'CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)']);
        $this->el($dian, 'sts:SoftwareSecurityCode', $p['software']['security_code'], ['schemeAgencyID' => '195', 'schemeAgencyName' => 'CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)']);
        $ap = $this->el($dian, 'sts:AuthorizationProvider');
        $this->el($ap, 'sts:AuthorizationProviderID', '800197268', ['schemeAgencyID' => '195', 'schemeAgencyName' => 'CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)', 'schemeID' => '4', 'schemeName' => '31']);
        $this->el($dian, 'sts:QRCode', $p['qr']);
        // Espacio para la firma digital XAdES-EPES
        $this->el($this->el($exts, 'ext:UBLExtension'), 'ext:ExtensionContent');

        // ---- Encabezado ----
        $this->el($root, 'cbc:UBLVersionID', 'UBL 2.1');
        $this->el($root, 'cbc:CustomizationID', $p['customization_id']);
        $this->el($root, 'cbc:ProfileID', $p['profile_id']);
        $this->el($root, 'cbc:ProfileExecutionID', $p['environment']);
        $this->el($root, 'cbc:ID', $p['number']);
        $this->el($root, 'cbc:UUID', $p['uuid'], ['schemeID' => $p['environment'], 'schemeName' => $p['uuid_scheme']]);
        $this->el($root, 'cbc:IssueDate', $p['issue_date']);
        $this->el($root, 'cbc:IssueTime', $p['issue_time']);
        if ($isCredit) {
            $this->el($root, 'cbc:CreditNoteTypeCode', '91');
        } else {
            $this->el($root, 'cbc:InvoiceTypeCode', $p['type_code']);
        }
        foreach ($p['notes'] as $note) {
            $this->el($root, 'cbc:Note', $note);
        }
        $this->el($root, 'cbc:DocumentCurrencyCode', 'COP', ['listAgencyID' => '6', 'listAgencyName' => 'United Nations Economic Commission for Europe', 'listID' => 'ISO 4217 Alpha']);
        $this->el($root, 'cbc:LineCountNumeric', (string) count($p['lines']));

        if ($isCredit) {
            $dr = $this->el($root, 'cac:DiscrepancyResponse');
            $this->el($dr, 'cbc:ReferenceID', $p['reference']['number']);
            $this->el($dr, 'cbc:ResponseCode', $p['reference']['reason_code']);
            $this->el($dr, 'cbc:Description', $p['reference']['reason_text']);
            $br = $this->el($this->el($root, 'cac:BillingReference'), 'cac:InvoiceDocumentReference');
            $this->el($br, 'cbc:ID', $p['reference']['number']);
            $this->el($br, 'cbc:UUID', $p['reference']['uuid'], ['schemeName' => $p['reference']['uuid_scheme']]);
            $this->el($br, 'cbc:IssueDate', $p['reference']['issue_date']);
        }

        $this->party($this->el($root, 'cac:AccountingSupplierParty'), $p['issuer'], true);
        $this->party($this->el($root, 'cac:AccountingCustomerParty'), $p['customer'], false);

        // ---- Pago ----
        $pm = $this->el($root, 'cac:PaymentMeans');
        $this->el($pm, 'cbc:ID', '1'); // 1 = contado
        $this->el($pm, 'cbc:PaymentMeansCode', $p['payment_means_code']);
        $this->el($pm, 'cbc:PaymentDueDate', $p['issue_date']);

        // ---- Impuestos ----
        $this->taxTotal($root, $p['taxes']);

        // ---- Totales ----
        $t = $this->el($root, $isCredit ? 'cac:LegalMonetaryTotal' : 'cac:LegalMonetaryTotal');
        $this->amount($t, 'cbc:LineExtensionAmount', $p['totals']['line_extension']);
        $this->amount($t, 'cbc:TaxExclusiveAmount', $p['totals']['tax_exclusive']);
        $this->amount($t, 'cbc:TaxInclusiveAmount', $p['totals']['tax_inclusive']);
        $this->amount($t, 'cbc:PayableAmount', $p['totals']['payable']);

        // ---- Líneas ----
        foreach ($p['lines'] as $i => $l) {
            $line = $this->el($root, $isCredit ? 'cac:CreditNoteLine' : 'cac:InvoiceLine');
            $this->el($line, 'cbc:ID', (string) ($i + 1));
            $this->el($line, $isCredit ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity', (string) $l['qty'], ['unitCode' => '94']);
            $this->amount($line, 'cbc:LineExtensionAmount', $l['base']);
            if ($l['allowance'] > 0) {
                $ac = $this->el($line, 'cac:AllowanceCharge');
                $this->el($ac, 'cbc:ID', '1');
                $this->el($ac, 'cbc:ChargeIndicator', 'false');
                $this->el($ac, 'cbc:AllowanceChargeReason', 'Descuento');
                $this->el($ac, 'cbc:MultiplierFactorNumeric', number_format($l['discount_pct'], 2, '.', ''));
                $this->amount($ac, 'cbc:Amount', $l['allowance']);
                $this->amount($ac, 'cbc:BaseAmount', $l['gross_base']);
            }
            $this->taxTotal($line, [['rate' => $l['tax_rate'], 'base' => $l['base'], 'tax' => $l['tax']]]);
            $item = $this->el($line, 'cac:Item');
            $this->el($item, 'cbc:Description', $l['description']);
            $this->el($this->el($item, 'cac:SellersItemIdentification'), 'cbc:ID', $l['code']);
            $this->el($this->el($item, 'cac:StandardItemIdentification'), 'cbc:ID', $l['code'], ['schemeID' => '999', 'schemeName' => 'Estándar de adopción del contribuyente']);
            $price = $this->el($line, 'cac:Price');
            $this->amount($price, 'cbc:PriceAmount', $l['unit_base']);
            $this->el($price, 'cbc:BaseQuantity', '1', ['unitCode' => '94']);
        }

        return $this->doc->saveXML();
    }

    private function party(DOMElement $node, array $d, bool $isIssuer): void
    {
        $this->el($node, 'cbc:AdditionalAccountID', (string) $d['person_type']);
        $party = $this->el($node, 'cac:Party');
        if ($d['person_type'] == 2 && !$isIssuer) {
            $this->el($this->el($party, 'cac:PartyIdentification'), 'cbc:ID', $d['doc_number'], $d['doc_type'] === '31' ? ['schemeName' => '31', 'schemeID' => $d['dv']] : ['schemeName' => $d['doc_type']]);
        }
        $this->el($this->el($party, 'cac:PartyName'), 'cbc:Name', $d['trade_name'] ?? $d['name']);
        if (!empty($d['city_code'])) {
            $this->address($this->el($this->el($party, 'cac:PhysicalLocation'), 'cac:Address'), $d);
        }
        $pts = $this->el($party, 'cac:PartyTaxScheme');
        $this->el($pts, 'cbc:RegistrationName', $d['name']);
        $this->el($pts, 'cbc:CompanyID', $d['doc_number'], $this->idAttrs($d));
        $this->el($pts, 'cbc:TaxLevelCode', $d['tax_responsibilities'], ['listName' => $d['tax_regime']]);
        if (!empty($d['city_code'])) {
            $this->address($this->el($pts, 'cac:RegistrationAddress'), $d);
        }
        $ts = $this->el($pts, 'cac:TaxScheme');
        $responsible = $d['tax_regime'] === '48';
        $this->el($ts, 'cbc:ID', $responsible ? '01' : 'ZZ');
        $this->el($ts, 'cbc:Name', $responsible ? 'IVA' : 'No aplica');

        $ple = $this->el($party, 'cac:PartyLegalEntity');
        $this->el($ple, 'cbc:RegistrationName', $d['name']);
        $this->el($ple, 'cbc:CompanyID', $d['doc_number'], $this->idAttrs($d));
        if ($isIssuer && !empty($d['prefix'])) {
            $this->el($this->el($ple, 'cac:CorporateRegistrationScheme'), 'cbc:ID', $d['prefix']);
        }
        if (!empty($d['email']) || !empty($d['phone'])) {
            $c = $this->el($party, 'cac:Contact');
            if (!empty($d['phone'])) {
                $this->el($c, 'cbc:Telephone', $d['phone']);
            }
            if (!empty($d['email'])) {
                $this->el($c, 'cbc:ElectronicMail', $d['email']);
            }
        }
    }

    private function idAttrs(array $d): array
    {
        $a = ['schemeAgencyID' => '195', 'schemeAgencyName' => 'CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)', 'schemeName' => $d['doc_type']];
        if ($d['doc_type'] === '31') {
            $a['schemeID'] = $d['dv'];
        }
        return $a;
    }

    private function address(DOMElement $n, array $d): void
    {
        $this->el($n, 'cbc:ID', $d['city_code']);
        $this->el($n, 'cbc:CityName', $d['city_name'] ?? '');
        $this->el($n, 'cbc:CountrySubentity', $d['department'] ?? '');
        $this->el($n, 'cbc:CountrySubentityCode', substr((string) $d['city_code'], 0, 2));
        $this->el($this->el($n, 'cac:AddressLine'), 'cbc:Line', $d['address'] ?: 'Sin dirección');
        $c = $this->el($n, 'cac:Country');
        $this->el($c, 'cbc:IdentificationCode', 'CO');
        $this->el($c, 'cbc:Name', 'Colombia', ['languageID' => 'es']);
    }

    private function taxTotal(DOMElement $parent, array $taxes): void
    {
        $tt = $this->el($parent, 'cac:TaxTotal');
        $this->amount($tt, 'cbc:TaxAmount', array_sum(array_column($taxes, 'tax')));
        foreach ($taxes as $t) {
            $sub = $this->el($tt, 'cac:TaxSubtotal');
            $this->amount($sub, 'cbc:TaxableAmount', $t['base']);
            $this->amount($sub, 'cbc:TaxAmount', $t['tax']);
            $cat = $this->el($sub, 'cac:TaxCategory');
            $this->el($cat, 'cbc:Percent', number_format((float) $t['rate'], 2, '.', ''));
            $sch = $this->el($cat, 'cac:TaxScheme');
            $this->el($sch, 'cbc:ID', '01');
            $this->el($sch, 'cbc:Name', 'IVA');
        }
    }

    private function amount(DOMNode $parent, string $name, float $value): void
    {
        $this->el($parent, $name, number_format($value, 2, '.', ''), ['currencyID' => 'COP']);
    }

    private function el(DOMNode $parent, string $qname, ?string $value = null, array $attrs = []): DOMElement
    {
        $prefix = strstr($qname, ':', true);
        $e = $this->doc->createElementNS(self::NS[$prefix], $qname);
        if ($value !== null) {
            $e->appendChild($this->doc->createTextNode($value));
        }
        foreach ($attrs as $k => $v) {
            $e->setAttribute($k, (string) $v);
        }
        $parent->appendChild($e);
        return $e;
    }
}
