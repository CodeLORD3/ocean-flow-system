
CREATE OR REPLACE FUNCTION public.notify_image_interaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _img public.entity_images;
  _actor uuid := auth.uid();
  _msg text;
  _store uuid;
BEGIN
  SELECT * INTO _img FROM public.entity_images WHERE id = NEW.image_id;
  IF _img.id IS NULL OR _img.uploaded_by IS NULL THEN RETURN NEW; END IF;
  IF _actor IS NOT NULL AND _actor = _img.uploaded_by THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'entity_image_comments' THEN
    _msg := coalesce(NEW.author_name, 'Någon') || ' kommenterade din bild';
  ELSE
    _msg := 'Någon hjärtade din bild';
  END IF;

  IF _img.entity_type = 'store' THEN
    _store := _img.entity_id;
  END IF;

  INSERT INTO public.notifications (portal, target_page, store_id, message, entity_type, entity_id, user_id)
  VALUES
    ('shop', '/image-feed', _store, _msg, 'entity_image', _img.id::text, _img.uploaded_by),
    ('wholesale', '/image-feed', NULL, _msg, 'entity_image', _img.id::text, _img.uploaded_by),
    ('production', '/image-feed', NULL, _msg, 'entity_image', _img.id::text, _img.uploaded_by);

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_image_comment ON public.entity_image_comments;
CREATE TRIGGER trg_notify_image_comment
AFTER INSERT ON public.entity_image_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_image_interaction();

DROP TRIGGER IF EXISTS trg_notify_image_favorite ON public.entity_image_favorites;
CREATE TRIGGER trg_notify_image_favorite
AFTER INSERT ON public.entity_image_favorites
FOR EACH ROW EXECUTE FUNCTION public.notify_image_interaction();
