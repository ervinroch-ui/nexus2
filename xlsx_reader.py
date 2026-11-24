"""Small, dependency-free XLSX reader for dashboard imports.
Reads worksheet values and formulas from the OOXML package using the Python stdlib.
It intentionally does not expose or retain sensitive spreadsheet columns.
"""
from __future__ import annotations
import posixpath
import re
from datetime import datetime
import zipfile
import xml.etree.ElementTree as ET
from pathlib import PurePosixPath

NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkgrel": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def _tag(name: str) -> str:
    return f"{{{NS['main']}}}{name}"


def _col_index(cell_ref: str) -> int:
    letters = re.match(r"([A-Z]+)", cell_ref or "")
    if not letters:
        return 0
    value = 0
    for char in letters.group(1):
        value = value * 26 + ord(char) - 64
    return value - 1


def _clean_number(value: str):
    if value is None or value == "":
        return None
    try:
        number = float(value)
        if number.is_integer():
            return int(number)
        return number
    except (TypeError, ValueError):
        return value


def _rich_text(node) -> str:
    return "".join(t.text or "" for t in node.iter(_tag("t")))


def read_xlsx(path: str) -> dict:
    """Return {sheet_name: {rows: 2D list, formulas: {"A1": "..."}}}."""
    with zipfile.ZipFile(path, "r") as archive:
        names = set(archive.namelist())
        workbook_root = ET.fromstring(archive.read("xl/workbook.xml"))
        rel_root = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rels = {}
        for rel in rel_root.findall(f"{{{NS['pkgrel']}}}Relationship"):
            target = rel.attrib.get("Target", "")
            if target.startswith("/"):
                target = target.lstrip("/")
            else:
                target = posixpath.normpath(posixpath.join("xl", target))
            rels[rel.attrib.get("Id")] = target

        shared = []
        if "xl/sharedStrings.xml" in names:
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = [_rich_text(si) for si in root.findall(_tag("si"))]

        result = {}
        sheets_node = workbook_root.find(_tag("sheets"))
        if sheets_node is None:
            return result
        for sheet_node in sheets_node.findall(_tag("sheet")):
            sheet_name = sheet_node.attrib.get("name", "Hoja")
            rel_id = sheet_node.attrib.get(f"{{{NS['rel']}}}id")
            target = rels.get(rel_id)
            if not target or target not in names:
                continue
            root = ET.fromstring(archive.read(target))
            sheet_data = root.find(_tag("sheetData"))
            rows = []
            formulas = {}
            if sheet_data is not None:
                for row_node in sheet_data.findall(_tag("row")):
                    cells = {}
                    for cell in row_node.findall(_tag("c")):
                        ref = cell.attrib.get("r", "")
                        col = _col_index(ref)
                        kind = cell.attrib.get("t", "")
                        v_node = cell.find(_tag("v"))
                        formula_node = cell.find(_tag("f"))
                        value = None
                        if kind == "inlineStr":
                            inline = cell.find(_tag("is"))
                            value = _rich_text(inline) if inline is not None else None
                        elif v_node is not None:
                            raw = v_node.text
                            if kind == "s":
                                try:
                                    value = shared[int(raw)]
                                except (ValueError, IndexError):
                                    value = raw
                            elif kind == "b":
                                value = raw == "1"
                            elif kind in ("str", "e"):
                                value = raw
                            else:
                                value = _clean_number(raw)
                        if value is not None:
                            cells[col] = value
                        if formula_node is not None:
                            formulas[ref] = formula_node.text or ""
                    if cells:
                        max_col = max(cells)
                        arr = [None] * (max_col + 1)
                        for col, val in cells.items():
                            arr[col] = val
                    else:
                        arr = []
                    rows.append(arr)
            # Pad rows to a shared width for easier column indexing.
            width = max((len(r) for r in rows), default=0)
            rows = [r + [None] * (width - len(r)) for r in rows]
            result[sheet_name] = {"rows": rows, "formulas": formulas}
        return result


def _norm(value) -> str:
    import unicodedata
    text = "" if value is None else str(value)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", text).strip().casefold()


def _header_index(headers, *candidates):
    normalized = [_norm(x) for x in headers]
    for candidate in candidates:
        candidate = _norm(candidate)
        for idx, value in enumerate(normalized):
            if value == candidate or candidate in value:
                return idx
    return None


def _safe_num(value, default=0):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _first_data_sheet(sheets, required_headers):
    required = [_norm(x) for x in required_headers]
    for name, data in sheets.items():
        rows = data["rows"]
        if not rows:
            continue
        header = [_norm(x) for x in rows[0]]
        if all(any(req == h or req in h for h in header) for req in required):
            return name, rows
    return None, []



MONTH_ALIASES = {
    "enero": 1, "ene": 1,
    "febrero": 2, "feb": 2,
    "marzo": 3, "mar": 3,
    "abril": 4, "abr": 4,
    "mayo": 5, "may": 5,
    "junio": 6, "jun": 6,
    "julio": 7, "jul": 7,
    "agosto": 8, "ago": 8,
    "septiembre": 9, "setiembre": 9, "sept": 9, "sep": 9,
    "octubre": 10, "oct": 10,
    "noviembre": 11, "nov": 11,
    "diciembre": 12, "dic": 12,
}

def _month_number(sheet_name: str, meta_prefix: bool = False):
    normalized = _norm(sheet_name)
    if meta_prefix:
        if not normalized.startswith("meta "):
            return None
        normalized = normalized[5:].strip()
    normalized = re.sub(r"\b20\d{2}\b", "", normalized).strip()
    tokens = normalized.split()
    for token in tokens:
        if token in MONTH_ALIASES:
            return MONTH_ALIASES[token]
    return None

def _pick_month_sheet(sheet_names, meta_prefix: bool = False):
    candidates = [(number, name) for name in sheet_names if (number := _month_number(name, meta_prefix)) is not None]
    if not candidates:
        return None
    current_month = datetime.now().month
    current = [name for number, name in candidates if number == current_month]
    if current:
        return current[-1]
    return max(candidates, key=lambda item: item[0])[1]

def analyze_workbook(path: str, filename: str) -> dict:
    """Classify an XLSX and return safe, aggregate-only import data."""
    sheets = read_xlsx(path)
    sheet_names = list(sheets)
    normalized_names = {_norm(x): x for x in sheet_names}
    fname = _norm(filename)
    result = {
        "filename": filename,
        "type": "general",
        "sheets": [],
        "rows": 0,
        "summary": {},
        "notes": [],
    }
    for name, info in sheets.items():
        data_rows = max(0, len(info["rows"]) - 1)
        result["sheets"].append({"name": name, "rows": data_rows, "formulas": len(info["formulas"])})
        result["rows"] += data_rows

    # Sales / installation request workbooks.
    if "registradas" in normalized_names and "atendidas" in normalized_names:
        result["type"] = "solicitudes"
        summary = {"registered": 0, "attended": 0, "serviceTypes": [], "supervisors": [], "zones": [], "sellers": []}
        for key, out_key in (("registradas", "registered"), ("atendidas", "attended")):
            sheet = sheets[normalized_names[key]]["rows"]
            summary[out_key] = max(0, len(sheet) - 1)
        rows = sheets[normalized_names["atendidas"]]["rows"]
        if rows:
            h = rows[0]
            idx_service = _header_index(h, "TIPO DE SERVICIO")
            idx_supervisor = _header_index(h, "SUPERVISOR")
            idx_zone = _header_index(h, "ZONA")
            idx_seller = _header_index(h, "VENDEDOR2", "VENDEDOR")
            from collections import Counter
            def counts(idx):
                if idx is None:
                    return []
                c = Counter(str(r[idx]).strip() for r in rows[1:] if idx < len(r) and r[idx] not in (None, ""))
                return [{"name": k, "count": v} for k, v in c.most_common(30)]
            summary["serviceTypes"] = counts(idx_service)
            summary["supervisors"] = counts(idx_supervisor)
            summary["zones"] = counts(idx_zone)
            summary["sellers"] = counts(idx_seller)
        result["summary"] = summary
        result["notes"].append("Se agruparon solicitudes por servicio, vendedor, supervisor y zona; se omitieron cédulas, teléfonos, direcciones y datos de clientes.")
        return result

    # Conecta team workbook: the active tab changes monthly, so detect all Spanish month names.
    month_sheet = _pick_month_sheet(sheet_names)
    if month_sheet and ("general oeste" in normalized_names or "roster" in normalized_names):
        result["type"] = "conecta"
        current_month_label = month_sheet.upper()
        rows = sheets[month_sheet]["rows"]
        leaders = []
        current_leader = None
        current_products = [0.0] * 7
        products = ["DTH", "INT HFC", "TV HFC", "LDA", "IFI", "INT GPON", "TV GPON"]
        referred_total = 0.0
        for row in rows:
            vals = row + [None] * max(0, 10 - len(row))
            first_raw = str(vals[0] or "").strip()
            first = first_raw.upper()
            label = str(vals[1] or "").strip()
            # Team labels are standalone text rows in column A; the first row is the area title.
            row_product_headers = any(_norm(vals[i]) in {_norm(x) for x in products} for i in range(2, 9) if vals[i] is not None)
            if first_raw and not first_raw.isdigit() and first not in ("MANAGUA OESTE", "SUBTOTAL", "TOTAL", "TOTAL GENERAL", "REFERIDOS"):
                if row_product_headers or all(vals[i] in (None, "") for i in range(1, 10)):
                    current_leader = first_raw
            if "SUBTOTAL" in first or "SUBTOTAL" in label.upper():
                computed = {products[i]: current_products[i] for i in range(7)}
                leaders.append({"name": current_leader or "Equipo", "products": computed, "total": sum(current_products)})
                current_products = [0.0] * 7
            elif first.isdigit() and _norm(label) == "referidos":
                referred_total = sum(_safe_num(vals[i+2]) for i in range(7))
            elif first.isdigit() and label:
                for i in range(7):
                    current_products[i] += _safe_num(vals[i+2])
        referred_total = referred_total or 0.0
        # Rebuild the group total from the source rows; do not trust stale cached formula results.
        current_total = sum(x["total"] for x in leaders) + referred_total
        result["summary"] = {"currentMonth": current_month_label, "supervisorTotals": leaders, "currentMonthTotal": current_total, "referredTotal": referred_total, "monthlySheets": [x for x in sheet_names if _month_number(x) is not None], "formulas": sum(len(s["formulas"]) for s in sheets.values())}
        general_name = normalized_names.get("general oeste")
        if general_name:
            general_rows = sheets[general_name]["rows"]
            result["summary"]["performanceRows"] = max(0, len(general_rows) - 1)
            history_months = [str(general_rows[1][i]).strip() for i in range(3, 6) if len(general_rows) > 1 and i < len(general_rows[1]) and general_rows[1][i]]
            result["summary"]["historyMonths"] = history_months
            performance = []
            current_group = "Grupo sin nombre"
            headers_active = False
            for row in general_rows:
                first_cell = str(row[0] or "").strip() if row else ""
                if first_cell and first_cell.upper().startswith("GRUPO"):
                    current_group = first_cell
                    headers_active = False
                    continue
                if _norm(first_cell) == "producto":
                    headers_active = True
                    continue
                if headers_active and len(row) > 9 and row[1] not in (None, ""):
                    goal = _safe_num(row[2])
                    august = _safe_num(row[3])
                    september = _safe_num(row[4])
                    october = _safe_num(row[5])
                    current_value = _safe_num(row[6])
                    days_projection = (_safe_num(general_rows[0][11]) - _safe_num(general_rows[0][12])) if len(general_rows[0]) > 12 else 0
                    performance.append({
                        "group": current_group, "product": str(row[1]), "goal": goal,
                        "august": august, "september": september, "october": october,
                        "history": [august, september, october], "current": current_value,
                        "projection": (current_value / goal) * days_projection if goal else None,
                        "completion": current_value / goal if goal else None,
                        "vsMonth": current_value / october if october else None
                    })
            result["summary"]["performance"] = performance
        result["notes"].append(f"Se seleccionó la pestaña mensual {current_month_label}; se reconstruyeron subtotales por supervisor y producto. La proyección usa los días restantes indicados por la fórmula del libro.")
        return result

    # Multimedia operations workbook.
    if "mes" in normalized_names or "meta nov" in normalized_names or "combustible" in normalized_names:
        result["type"] = "multimedia"
        summary = {"targets": {}, "daily": {}, "roster": {}, "fuelPlan": []}
        meta_name = _pick_month_sheet(sheet_names, meta_prefix=True)
        if meta_name:
            rows = sheets[meta_name]["rows"]
            for row in rows:
                if row and _norm(row[0]) in ("total multimedia pacifico", "total multimedia"):
                    summary["targets"] = {"plazas": _safe_num(row[2]), "monthlyHighs": _safe_num(row[3]), "sheet": meta_name}
        mes_name = normalized_names.get("mes")
        if mes_name:
            rows = sheets[mes_name]["rows"]
            for row in rows:
                if row and _norm(row[0]) == "total general":
                    # H total units, I weighted output, J daily challenge, K deficit, L completion, M..Q workforce/effectiveness.
                    vals = row + [None] * max(0, 17-len(row))
                    units = sum(_safe_num(vals[i]) for i in range(2, 7))
                    weighted = _safe_num(vals[2]) * 3 + _safe_num(vals[3]) * 2 + _safe_num(vals[4]) + _safe_num(vals[5]) + _safe_num(vals[6])
                    challenge = _safe_num(vals[9])
                    roster_count = _safe_num(vals[14])
                    sellers_count = _safe_num(vals[15])
                    summary["daily"] = {"units": units, "weightedProducts": weighted, "dailyChallenge": challenge, "deficit": weighted - challenge, "completion": weighted / challenge if challenge else None, "plazas": _safe_num(vals[12]), "freelance": _safe_num(vals[13]), "roster": roster_count, "sellers": sellers_count, "effectiveness": sellers_count / roster_count if roster_count else None}
        roster_name, roster_rows = _first_data_sheet(sheets, ["Nombre Completo", "Supervisor"])
        if roster_rows:
            hi = roster_rows[0]
            isup = _header_index(hi, "Supervisor")
            icontract = _header_index(hi, "Tipo Contrato")
            from collections import Counter
            by_supervisor = Counter()
            by_contract = Counter()
            for row in roster_rows[1:]:
                if isup is not None and isup < len(row) and row[isup]:
                    by_supervisor[str(row[isup]).strip()] += 1
                if icontract is not None and icontract < len(row) and row[icontract]:
                    by_contract[str(row[icontract]).strip()] += 1
            summary["roster"] = {"total": max(0, len(roster_rows)-1), "bySupervisor": [{"name":k,"count":v} for k,v in by_supervisor.most_common()], "byContract": [{"name":k,"count":v} for k,v in by_contract.most_common()]}
        fuel_name = normalized_names.get("combustible")
        if fuel_name:
            rows = sheets[fuel_name]["rows"]
            # Work plan table is intentionally summarized; no personal data is present.
            summary["fuelPlan"] = [{"day": str(r[1]), "zone": str(r[2]), "route": str(r[3]), "distance": str(r[4])} for r in rows[2:9] if len(r) >= 5 and r[1]]
        summary["formulas"] = sum(len(s["formulas"]) for s in sheets.values())
        result["summary"] = summary
        result["notes"].append("Se trasladaron las fórmulas de parte diario: CCT×3 + CCD×2 + INDV + IFI + DTH; déficit = ponderado − reto; cumplimiento = ponderado / reto; efectividad = vendedores / roster.")
        return result

    # Roster or Suroriente employee lists: aggregate by supervisor and contract only.
    roster_name, roster_rows = _first_data_sheet(sheets, ["Nombre Completo", "Supervisor"])
    if roster_rows:
        is_suroriente = "suroriente" in fname
        result["type"] = "suroriente" if is_suroriente else "roster"
        h = roster_rows[0]
        iname = _header_index(h, "Nombre Completo")
        isup = _header_index(h, "Supervisor")
        icontract = _header_index(h, "Tipo Contrato")
        idept = _header_index(h, "Departamento")
        icargo = _header_index(h, "Cargo")
        from collections import Counter
        by_sup, by_contract, by_dept = Counter(), Counter(), Counter()
        staff_rows = []
        for row in roster_rows[1:]:
            name = row[iname] if iname is not None and iname < len(row) else None
            if not name or _norm(name) in ("vacante", "" ):
                continue
            # NUMEROS SURORIENTE has section-heading rows for supervisors and vacancy placeholders.
            if is_suroriente:
                cargo = row[icargo] if icargo is not None and icargo < len(row) else None
                if not cargo or _norm(cargo) == "supervisor":
                    continue
            elif isup is not None and (isup >= len(row) or not row[isup]):
                continue
            staff_rows.append(row)
            if isup is not None and isup < len(row) and row[isup]: by_sup[str(row[isup]).strip()] += 1
            if icontract is not None and icontract < len(row) and row[icontract]: by_contract[str(row[icontract]).strip()] += 1
            if idept is not None and idept < len(row) and row[idept]: by_dept[str(row[idept]).strip()] += 1
        result["summary"] = {"rosterTotal": len(staff_rows), "bySupervisor": [{"name":k,"count":v} for k,v in by_sup.most_common()], "byContract": [{"name":k,"count":v} for k,v in by_contract.most_common()], "byDepartment": [{"name":k,"count":v} for k,v in by_dept.most_common()]}
        result["notes"].append("Se importó únicamente el resumen del personal activo listado; se excluyeron cédulas, cuentas bancarias, teléfonos y fechas de nacimiento.")
        return result

    # Suroriente workbook has an unusual roster header including NUMERO and Cargo.
    sur_name, sur_rows = _first_data_sheet(sheets, ["Nombre Completo", "NUMERO", "Cargo"])
    if sur_rows:
        result["type"] = "suroriente"
        h = sur_rows[0]
        isup = _header_index(h, "Supervisor")
        icargo = _header_index(h, "Cargo")
        from collections import Counter
        by_sup = Counter()
        for row in sur_rows[1:]:
            if icargo is not None and icargo < len(row) and _norm(row[icargo]) == "supervisor":
                name = next((str(x).strip() for x in row if x and _norm(x) not in ("supervisor", "", "none")), "Supervisor")
                by_sup[name] += 0
            elif isup is not None and isup < len(row) and row[isup]:
                by_sup[str(row[isup]).strip()] += 1
        result["summary"] = {"rosterTotal": max(0, len(sur_rows)-1), "bySupervisor": [{"name":k,"count":v} for k,v in by_sup.most_common()]}
        result["notes"].append("Se importaron únicamente los conteos por supervisor; se excluyeron cédulas, cuentas bancarias, teléfonos y otros datos sensibles del roster.")
        return result

    result["notes"].append("No se reconoció una plantilla específica. Se registraron hojas, cantidad de filas y fórmulas; no se modificaron los datos originales.")
    return result
