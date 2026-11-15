package {{package}}.effect;

import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;

/** {{displayName}} 状态效果骨架。 */
public class {{ClassName}}Effect extends MobEffect {
    public {{ClassName}}Effect() {
        super(MobEffectCategory.BENEFICIAL, 0x{{color}});
    }
}
