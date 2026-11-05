const EMPTY_FILTERS = { search: '', status: 'all', center: 'all', submittedFrom: '', submittedTo: '' };

let filters = { ...EMPTY_FILTERS };

export function getStudentListFilters() {
  return filters;
}

export function setStudentListFilters(nextFilters) {
  filters = { ...EMPTY_FILTERS, ...nextFilters };
}

export function clearStudentListFilters() {
  filters = { ...EMPTY_FILTERS };
}
