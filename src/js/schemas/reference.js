/* MAHAM — Record types: courses, recommended courses, IT / EMR directory, SRS, info. */
'use strict';

Object.assign(Schemas, {
  course: {
    single: 'Course',
    defaults: () => ({ analyst: App.me, status: 'In Progress' }),
    fields: [
      { key: 'analyst', label: 'Name', type: 'member', required: true },
      {
        key: 'course',
        label: 'Course name',
        type: 'list',
        options: () => Store.all('reccourse').map(r => r.course),
        required: true,
        span: 2,
      },
      { key: 'hrs', label: 'Hours', type: 'number', min: 0 },
      { key: 'status', label: 'Status', type: 'select', options: L('courseStatus'), blank: false },
      { key: 'start', label: 'Start date', type: 'date' },
      { key: 'end', label: 'End date', type: 'date' },
      { key: 'ppt', label: 'Presentation date', type: 'date' },
      { key: 'completed', label: 'Completed (C)', type: 'bool' },
      { key: 'presented', label: 'Presented (P)', type: 'bool' },
    ],
  },
  reccourse: {
    single: 'Recommended course',
    fields: [
      { key: 'category', label: 'Category', type: 'list', options: () => [...new Set(Store.all('reccourse').map(r => r.category))] },
      { key: 'course', label: 'Course', type: 'text', required: true, span: 2 },
      { key: 'hrs', label: 'Hours', type: 'number' },
    ],
  },
  itdir: {
    single: 'IT contact',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'region', label: 'Region', type: 'list', options: ['Riyadh', 'Jeddah', 'Madinah', 'Dammam', 'Al Ahsa'] },
      { key: 'dept', label: 'Department', type: 'text' },
      { key: 'section', label: 'Section', type: 'text' },
      {
        key: 'team',
        label: 'Team',
        type: 'list',
        options: () =>
          [
            ...new Set(
              Store.all('itdir')
                .map(r => r.team)
                .filter(Boolean)
            ),
          ].sort(),
        hint: 'e.g. APPS, LAB, Network, Applications',
      },
      {
        key: 'reportsTo',
        label: 'Reports to',
        type: 'select',
        options: () => DirX.managerOptions(UI._recBase),
        blank: '— nobody (top of the chart) —',
        hint: 'Their direct manager — builds the hierarchy',
      },
      { key: 'bn', label: 'Badge no.', type: 'text' },
      { key: 'office', label: 'Office / ext.', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
    ],
  },
  userdir: {
    single: 'User contact',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'dept', label: 'Department', type: 'select', options: () => DirX.depts(), required: true },
      { key: 'position', label: 'Position / title', type: 'text' },
      { key: 'bn', label: 'Badge no.', type: 'text' },
      { key: 'facility', label: 'Facility', type: 'list', options: L('facilities') },
      { key: 'ward', label: 'Ward / unit', type: 'list', options: L('wards') },
      { key: 'ext', label: 'Ext.', type: 'text' },
      { key: 'mobile', label: 'Mobile', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea', span: 2, rows: 2 },
    ],
  },
  emrdir: {
    single: 'EMR contact',
    fields: [
      { key: 'facility', label: 'Facility', type: 'list', options: L('facilities') },
      { key: 'ward', label: 'Dept / Ward', type: 'list', options: L('wards') },
      { key: 'nurse', label: 'Nurse name', type: 'text' },
      { key: 'bn', label: 'Badge no.', type: 'text' },
      { key: 'ext', label: 'Ext.', type: 'text' },
      { key: 'jc', label: 'JC number', type: 'text' },
      { key: 'analyst', label: 'Analyst', type: 'member' },
    ],
  },
  /* Dashboards & Links (was "SRS & E-CTS": the old number / owner are shown as name / responsible) */
  srs: {
    single: 'Dashboard / link',
    defaults: () => ({ category: 'Dashboard' }),
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, span: 2, placeholder: 'e.g. OR utilisation dashboard' },
      { key: 'url', label: 'Link', type: 'text', span: 2, placeholder: 'https://…  or  \\\\server\\share\\file' },
      {
        key: 'responsible',
        label: 'Responsible',
        type: 'list',
        options: () => [
          ...new Set(
            [...Store.activeTeam().map(m => Store.memberShort(m.id)), ...Store.all('srs').map(r => r.responsible || r.owner)].filter(
              Boolean
            )
          ),
        ],
        placeholder: 'pick or type a name',
      },
      {
        key: 'category',
        label: 'Type',
        type: 'list',
        options: () => [...new Set(['Dashboard', 'Report', 'Link', ...Store.all('srs').map(r => r.category)].filter(Boolean))],
      },
      { key: 'notes', label: 'Notes', type: 'textarea', span: 2, rows: 2 },
    ],
    beforeSave(r) {
      if (!r.name && r.number) r.name = r.number;
      if (!r.responsible && r.owner) r.responsible = r.owner;
      r.url = Links.clean(r.url);
    },
  },
  info: {
    single: 'Info item',
    fields: [
      { key: 'category', label: 'Category', type: 'list', options: () => [...new Set(Store.all('info').map(r => r.category))] },
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'value', label: 'Value / details', type: 'textarea', span: 2, rows: 3 },
      { key: 'url', label: 'Link (optional)', type: 'text', span: 2, placeholder: 'https://…  or  \\\\server\\share\\file' },
    ],
    beforeSave(r) {
      r.url = Links.clean(r.url);
    },
    formNote: 'Avoid storing passwords here — everyone with access to the shared folder can read this data.',
  },
});
