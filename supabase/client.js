import { createClient } from '@supabase/supabase-js';   
const SUPABASE_URL = 'https://ylexszxzdnotgfvzjpfb.supabase.co';
const SUPABASE_KEY = 'sb_publishable__0aT2EMc2CQJODv8oI46JA_AqmsHrWT';

export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

const getInvitation = async () => {
    const { data, error } = await supabase
        .from('invitations')
        .select('id, name, slug, data_key')
        .eq('slug', 'ren-nisa')
        .single();

    if (error) {
        console.error('Invitation error:', error);
        return null;
    }

    return data;
};

export const invitation = getInvitation();