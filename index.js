const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('🤖 بوت مشاوي الكينغ شغال رسمي!'));

client.on('message', async msg => {
    const from = msg.from;
    const body = msg.body ? msg.body.trim() : '';

    if (from.includes('@g.us') || from === 'status@broadcast') return;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    if (currentHour < 18 || (currentHour === 23 && currentMinute > 30) || currentHour > 23) {
        if (body.toLowerCase() === 'الملك' || body === 'ابدأ' || body === '1') {
            await msg.reply("👑 *مشاوي الكينغ يرحب بك!* 🥩\nاستقبال الطلبات مغلق حالياً. نتشرف بكم يومياً من *صلاة المغرب حتى الساعة 11:30 ليلاً*.");
        }
        return;
    }

    let { data: session } = await supabase.from('user_sessions').select('*').eq('user_phone', from).single();

    if (!session && (body.toLowerCase() === 'الملك' || body === 'ابدأ' || body === '1')) {
        const { data: order } = await supabase.from('orders').insert([{ user_phone: from }]).select().single();
        await supabase.from('user_sessions').insert([{ user_phone: from, current_state: 'awaiting_name', active_order_id: order.id }]);
        await client.sendMessage(from, "👑 *مرحباً بك في مشاوي الكينغ - فوغالة* 🥩🔥\n\nباه نوجدو طلبك بدقة ومن غير ما تستنى، راح نرافقوك خطوة بخطوة.\n\n👤 من فضلك اكتب *اسمك الكريم* أولاً لبدء التسجيل:");
        return;
    }

    if (!session) return;
    const orderId = session.active_order_id;

    switch (session.current_state) {
        
        case 'awaiting_name':
            if (!body) return msg.reply("❌ يرجى كتابة اسمك بشكل صحيح كرسالة نصية:");
            await supabase.from('orders').update({ customer_name: body }).eq('id', orderId);
            await supabase.from('user_sessions').update({ current_state: 'awaiting_photo' }).eq('user_phone', from);
            await client.sendMessage(from, `📸 *خطوة أمنية لتأكيد الطلب يا سي ${body}*:\nمن فضلك *صور روحك سيلفي درك وابعثها هنا* باه المعلم يعرفك وجه لوجه غير تلحق للمحل وما يتخلطوش الطلبات.\n\n_(⚠️ السيستيم ماراحش يفوت حتى تبعث صورتك الشخصية)_`);
            break;

        case 'awaiting_photo':
            if (!msg.hasMedia || msg.type !== 'image') {
                return msg.reply("⚠️ عذراً! لازم تبعث صورتك الشخصية بصيغة صورة باه السيستيم يقبل الطلب ويكمل ديريكت.");
            }
            try {
                const media = await msg.downloadMedia();
                const buffer = Buffer.from(media.data, 'base64');
                const fileName = `${orderId}_${Date.now()}.jpg`;
                
                await supabase.storage.from('customer-photos').upload(fileName, buffer, { contentType: 'image/jpeg' });
                
                const { data: signedUrlData } = await supabase.storage.from('customer-photos').createSignedUrl(fileName, 600);

                await supabase.from('orders').update({ customer_photo_url: signedUrlData.signedUrl }).eq('id', orderId);
                await supabase.from('user_sessions').update({ current_state: 'selecting_bread' }).eq('user_phone', from);
                
                await client.sendMessage(from, "🥖 *اختر نوع وحجم الخبز لطلبك (اكتب رقم الخيار ديريكت):*\n\n1. خبزة كاملة 🥖\n2. نصف خبزة 🥖\n3. غير ربع (3/4) 🥖\n4. بدون خبز 🍽️ (طبق مشوي ديريكت)");
            } catch (err) {
                msg.reply("❌ حدث خطأ أثناء حفظ الصورة، يرجى إعادة إرسالها.");
            }
            break;

        case 'selecting_bread':
            let bread = "";
            if (body === '1') bread = "خبزة كاملة";
            else if (body === '2') bread = "نصف خبزة";
            else if (body === '3') bread = "غير ربع (3/4)";
            else if (body === '4') bread = "بدون خبز (طبق) 🍽️";
            else return msg.reply("❌ خيار غير صحيح. اكتب الرقم من 1 إلى 4 ديريكت:");

            await supabase.from('orders').update({ bread_type: bread }).eq('id', orderId);

            if (body === '4') {
                await supabase.from('user_sessions').update({ current_state: 'selecting_items' }).eq('user_phone', from);
                await client.sendMessage(from, "🥩 *اختر نوع الشواء اللي حابو (اكتب رقم الصنف):*\n\n1. كبدة\n2. مرقاز\n3. سكالوب\n4. روايال\n5. كباب المحل (15 ألف)\n6. ستاك سكالوب عادي\n7. ستاك سكالوب ماريني");
            } else {
                await supabase.from('user_sessions').update({ current_state: 'selecting_sauce' }).eq('user_phone', from);
                await client.sendMessage(from, "🌶️🧀 *اختر الإضافات اللي حابها في السندويش:*\n\n1. هريسة فقط 🌶️\n2. فرماج فقط 🧀\n3. هريسة وفرماج مع بعض 🎉\n4. ناشف (بدون إضافات)");
            }
            break;

        case 'selecting_sauce':
            let harissa = false, cheese = false;
            if (body === '1') harissa = true;
            else if (body === '2') cheese = true;
            else if (body === '3') { harissa = true; cheese = true; }
            else if (body !== '4') return msg.reply("❌ اكتب الرقم من 1 إلى 4 ديريكت:");

            await supabase.from('orders').update({ harissa, cheese }).eq('id', orderId);
            await supabase.from('user_sessions').update({ current_state: 'selecting_items' }).eq('user_phone', from);
            await client.sendMessage(from, "🥩 *تفضل درك اختر نوع الشواء (اكتب رقم الصنف):*\n\n1. كبدة\n2. مرقاز\n3. سكالوب\n4. روايال\n5. كباب (15 ألف)\n6. ستاك سكالوب عادي\n7. ستاك سكالوب ماريني");
            break;

        case 'selecting_items':
            const items = { '1': 'كبدة', '2': 'مرقاز', '3': 'سكالوب', '4': 'روايال', '5': 'كباب (15ألف)', '6': 'ستاك عادي', '7': 'ستاك ماريني' };
            if (!items[body]) return msg.reply("❌ خيار غير صحيح. اكتب الرقم من 1 إلى 7:");

            await supabase.from('user_sessions').update({ current_state: 'awaiting_quantity', last_item_selected: items[body] }).eq('user_phone', from);
            await client.sendMessage(from, `🔢 شحال من سيخ أو قطعة حاب من صنف *(${items[body]})*؟\n_(اكتب العدد ديريكت بالأرقام مثلاً: 5)_`);
            break;

        case 'awaiting_quantity':
            const qty = parseInt(body);
            if (isNaN(qty) || qty <= 0) return msg.reply("❌ من فضلك اكتب عدد صحيح ومفهوم (مثال: 3):");

            await supabase.from('order_items').insert([{ order_id: orderId, item_type: session.last_item_selected, quantity: qty }]);
            await supabase.from('user_sessions').update({ current_state: 'item_added_decision' }).eq('user_phone', from);
            await client.sendMessage(from, "➕ حاب تزيد نوع لحم آخر في نفس الطلبية؟\n\n1. نعم، حاب نزيد صنف آخر 🥩\n2. لا، هادا برك كمل للتوابل ⏭️");
            break;

        case 'item_added_decision':
            if (body === '1') {
                await supabase.from('user_sessions').update({ current_state: 'selecting_items' }).eq('user_phone', from);
                await client.sendMessage(from, "🥩 اختر الصنف الإضافي (اكتب الرقم ديريكت):\n\n1. كبدة\n2. مرقاز\n3. سكالوب\n4. روايال\n5. كباب\n6. ستاك عادي\n7. ستاك ماريني");
            } else if (body === '2') {
                await supabase.from('user_sessions').update({ current_state: 'selecting_spices' }).eq('user_phone', from);
                await client.sendMessage(from, "🧂🫒 *آخر خطوة! اختر التوابل والزيادات المرافقة للشواء:*\n\n1. ملح وكمون فقط 🧂\n2. زيت زيتون فقط 🫒\n3. كلش مع بعض (ملح + كمون + زيت زيتون) 👑\n4. بلا توابل (صافي)");
            } else {
                return msg.reply("❌ يرجى اختيار 1 أو 2 ديريكت:");
            }
            break;

        case 'selecting_spices':
            let spices = "";
            if (body === '1') spices = "ملح وكمون";
            else if (body === '2') spices = "زيت زيتون";
            else if (body === '3') spices = "كلش (ملح+كمون+زيت زيتون)";
            else if (body === '4') spices = "بلا توابل";
            else return msg.reply("❌ يرجى اختيار الرقم من 1 إلى 4 ديريكت:");

            await supabase.from('orders').update({ spices, status: 'confirmed' }).eq('id', orderId);
            
            const { data: finalOrder } = await supabase.from('orders').select('*').eq('id', orderId).single();
            const { data: finalItems } = await supabase.from('order_items').select('*').eq('id', orderId);

            let itemsList = finalItems.map(i => `• ${i.quantity} أسياخ/قطع ${i.item_type}`).join('\n');

            const summary = `👑 *تم تأكيد طلبك بنجاح في مشاوي الكينغ!* 🎉\n\n👤 *الاسم:* ${finalOrder.customer_name}\n🥖 *الخبز:* ${finalOrder.bread_type}\n🌶️ *الإضافات:* ${finalOrder.harissa ? 'هريسة🌶️' : ''} ${finalOrder.cheese ? 'فرماج🧀' : ''} ${!finalOrder.harissa && !finalOrder.cheese ? 'ناشف' : ''}\n🥩 *المشاوي:*\n${itemsList}\n🧂 *التوابل:* ${finalOrder.spices}\n\n⏳ *ملاحظة:* شواك يطيب بالدالة وعلى قانتو فوق الجمر، تفضل ارفدو سخون غير يلحق وقت دالتك! مرحباً بك.`;
            await client.sendMessage(from, summary);

            try {
                const photoMedia = await MessageMedia.fromUrl(finalOrder.customer_photo_url);
                const adminMsg = `🚨 *طلب جديد واجد يا كينغ (#${orderId})* 🚨\n\n👤 *الزبون:* ${finalOrder.customer_name}\n🥖 *النوع:* ${finalOrder.bread_type}\n🌶️ *الصوص:* ${finalOrder.harissa ? 'هريسة' : ''} + ${finalOrder.cheese ? 'فرماج' : ''}\n🥩 *الطلبية:*\n${itemsList}\n🧂 *التوابل:* ${finalOrder.spices}\n\n📸 صورة الزبون مرفقة أسفله (الرابط خاص ومؤقت لـ 10 دقائق للأمان)!`;
                await client.sendMessage(process.env.MY_PERSONAL_PHONE, photoMedia, { caption: adminMsg });
            } catch (err) {
                console.log("خطأ في إرسال الإشعار للمالك: ", err);
