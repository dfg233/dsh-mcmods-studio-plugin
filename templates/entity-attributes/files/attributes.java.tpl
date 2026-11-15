package {{package}}.entity;

import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;

/** {{displayName}} 属性。 */
public final class {{ClassName}}Attributes {
    private {{ClassName}}Attributes() {}

    public static AttributeSupplier.Builder create() {
        return Mob.createMobAttributes()
            .add(Attributes.MAX_HEALTH, {{health}})
            .add(Attributes.ATTACK_DAMAGE, {{attack}})
            .add(Attributes.MOVEMENT_SPEED, 0.25);
    }
}
