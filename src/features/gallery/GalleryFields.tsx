import { GALLERY_CATEGORIES, type GalleryEventOption } from './model';

export type GalleryMeta = { category: string; eventId: string; eventDate: string };

type GalleryFieldsProps = {
  value: GalleryMeta;
  events: GalleryEventOption[];
  onChange: (next: GalleryMeta) => void;
  disabled?: boolean;
};

export default function GalleryFields({ value, events, onChange, disabled = false }: GalleryFieldsProps) {
  const update = (patch: Partial<GalleryMeta>) => onChange({ ...value, ...patch });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="gallery-category">التصنيف</label>
        <select id="gallery-category" value={value.category} disabled={disabled} onChange={event => update({ category: event.target.value })} className="input mt-2">
          {GALLERY_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="gallery-event">الفعالية المرتبطة</label>
        <select id="gallery-event" value={value.eventId} disabled={disabled} onChange={event => update({ eventId: event.target.value })} className="input mt-2">
          <option value="">بدون فعالية</option>
          {events.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="gallery-date">تاريخ النشاط</label>
        <input id="gallery-date" type="date" value={value.eventDate} disabled={disabled} onChange={event => update({ eventDate: event.target.value })} className="input mt-2 sm:max-w-xs" />
      </div>
    </div>
  );
}
